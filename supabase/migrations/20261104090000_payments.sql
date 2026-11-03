-- Phase 8: Razorpay payments for one-time unlocks.
--
-- Flow (see docs/RAZORPAY.md § 5):
--  1. The signed-in buyer asks to buy. purchase_eligibility() (as the buyer) checks the
--     product makes sense for them and this quiz, and returns the price.
--  2. The server creates a Razorpay order for that price and records it with
--     record_purchase_order() (service role only): a purchases row, status 'created'.
--  3. Razorpay's verified webhook calls mark_purchase_paid() (service role only), the
--     one thing that grants an unlock. It checks the amount and is safe to repeat.
--  4. Failed payments and refunds update the row; has_unlock() already ignores
--     anything that isn't 'paid'.
--
-- On sale now: second_chance (a friend, on a quiz they played), lock_retries and
-- full_board (the quiz's or road's owner). Other products come later.

-- Prices in paise. Must match src/lib/pricing.ts (a test compares them).
create function public.product_price(p_product text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_product
    when 'reveal' then 2900
    when 'full_board' then 4900
    when 'second_chance' then 900
    when 'lock_retries' then 2900
    when 'edition_birthday' then 4900
    when 'edition_couples' then 9900
    when 'pro_monthly' then 9900
    when 'pro_yearly' then 69900
  end;
$$;

-- Can the caller buy this product for this quiz right now? Returns
-- {product, quiz_id, amount_paise} or raises a short code.
create function public.purchase_eligibility(p_product text, p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_quiz public.quizzes%rowtype;
  v_attempt public.attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  if p_product is null or p_product not in ('second_chance', 'lock_retries', 'full_board') then
    raise exception 'not_for_sale' using errcode = '22023';
  end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;

  if p_product = 'second_chance' then
    if v_quiz.kind = 'road' then
      raise exception 'not_for_sale' using errcode = '22023';
    end if;
    if v_quiz.owner_id = v_uid then
      raise exception 'own_quiz' using errcode = '22023';
    end if;
    select * into v_attempt from public.attempts
    where quiz_id = v_quiz.id and player_id = v_uid order by attempt_no desc limit 1;
    if not found or v_attempt.finished_at is null then
      raise exception 'play_first' using errcode = '22023';
    end if;
    if v_attempt.attempt_no >= 2 or v_attempt.revealed_at is not null then
      raise exception 'already_used' using errcode = '22023';
    end if;
    if public.retries_locked_at(v_quiz.id) is not null then
      raise exception 'retries_locked' using errcode = '22023';
    end if;
    if public.has_second_chance(v_uid, v_quiz.id) then
      raise exception 'already_bought' using errcode = '23505';
    end if;
  else
    -- lock_retries and full_board are for the page's owner.
    if v_quiz.owner_id <> v_uid then
      raise exception 'quiz_not_found' using errcode = 'P0002';
    end if;
    if p_product = 'lock_retries' then
      if v_quiz.kind = 'road' then
        raise exception 'not_for_sale' using errcode = '22023';
      end if;
      if public.retries_locked_at(v_quiz.id) is not null then
        raise exception 'already_bought' using errcode = '23505';
      end if;
    elsif public.has_unlock(v_uid, 'full_board', v_quiz.id) then
      raise exception 'already_bought' using errcode = '23505';
    end if;
  end if;

  return jsonb_build_object(
    'product', p_product,
    'quiz_id', v_quiz.id,
    'amount_paise', public.product_price(p_product)
  );
end;
$$;

-- Server only: remember a Razorpay order we just created.
create function public.record_purchase_order(p_user uuid, p_product text, p_quiz_id uuid,
                                             p_amount integer, p_order_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_amount is distinct from public.product_price(p_product) then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;
  if p_order_id is null or p_order_id !~ '^order_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid_order' using errcode = '22023';
  end if;
  insert into public.purchases (user_id, product, quiz_id, amount_paise, razorpay_order_id)
  values (p_user, p_product, p_quiz_id, p_amount, p_order_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Server only, from the verified webhook: the order is paid. Safe to call again for
-- the same payment. Returns {status, changed}.
create function public.mark_purchase_paid(p_order_id text, p_payment_id text, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.purchases%rowtype;
begin
  select * into v_row from public.purchases where razorpay_order_id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_row.status in ('paid', 'refunded') then
    return jsonb_build_object('status', v_row.status, 'changed', false);
  end if;
  if p_amount is distinct from v_row.amount_paise then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;
  update public.purchases
  set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
  where id = v_row.id;
  return jsonb_build_object('status', 'paid', 'changed', true);
end;
$$;

-- Server only: a payment attempt on this order failed. A later success still wins.
create function public.mark_purchase_failed(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.purchases set status = 'failed'
  where razorpay_order_id = p_order_id and status = 'created'
  returning status into v_status;
  return jsonb_build_object('status', coalesce(v_status, (
    select status from public.purchases where razorpay_order_id = p_order_id
  )), 'changed', v_status is not null);
end;
$$;

-- Server only: the payment was refunded; the unlock goes away.
create function public.mark_purchase_refunded(p_payment_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.purchases set status = 'refunded'
  where razorpay_payment_id = p_payment_id and status = 'paid'
  returning status into v_status;
  return jsonb_build_object('changed', v_status is not null);
end;
$$;

-- A failed order may succeed on a retry, so 'failed' can still become 'paid'.
-- (mark_purchase_paid allows it: only 'paid' and 'refunded' are final.)

revoke execute on function
  public.product_price(text),
  public.purchase_eligibility(text, uuid),
  public.record_purchase_order(uuid, text, uuid, integer, text),
  public.mark_purchase_paid(text, text, integer),
  public.mark_purchase_failed(text),
  public.mark_purchase_refunded(text)
from public, anon, authenticated;

grant execute on function public.purchase_eligibility(text, uuid) to authenticated;
grant execute on function
  public.record_purchase_order(uuid, text, uuid, integer, text),
  public.mark_purchase_paid(text, text, integer),
  public.mark_purchase_failed(text),
  public.mark_purchase_refunded(text)
to service_role;
