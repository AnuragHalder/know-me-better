# Brand

Logo direction A ("Bright idea"): a question mark with light rays, lime on near-black.

| File                                        | Use                                                        |
| ------------------------------------------- | ---------------------------------------------------------- |
| `public/brand/logo-mark.svg`                | Master mark (rounded tile), any size                       |
| `public/brand/logo-mark-512.png`            | Mark with transparent corners, for slides and social posts |
| `public/brand/google-logo-120.png`          | Google Auth Platform › Branding › App logo (120×120)       |
| `public/brand/icon-192.png`, `icon-512.png` | Home-screen icons (web app manifest)                       |
| `src/app/icon.svg`                          | Browser tab icon (simplified: no rays, reads at 16 px)     |
| `src/app/apple-icon.png`                    | iPhone home-screen icon (180×180)                          |

In the app the mark is `BrandMark` (`src/components/ui/BrandMark.tsx`), drawn with the look's
tokens: lime on Clean, yellow on Slambook.

Colours: ink `#121316`, lime `#d4f53c`, violet `#5b3df5` (rays `#9d8bff`). Wordmark: Figtree
ExtraBold, "Who Knows" in ink, "Me Better" in violet on a lime highlighter stroke.

To re-export the PNGs after changing the SVG, render `logo-mark.svg` (square corners for the
Google, home-screen and Apple icons) at each size with any SVG renderer.
