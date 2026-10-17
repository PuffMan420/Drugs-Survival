# Ground textures upload (from Ted)

Each `*.webp.b64` is a base64-encoded LOSSLESS WebP. Decode with:

    cd incoming/ground && for f in *.webp.b64; do base64 -d "$f" > "${f%.b64}"; done && sha256sum -c SHA256SUMS

Street strips (1280x720, horizontal, full cross-section):
rows 0-103 sidewalk, 104-124 curb, 125-602 asphalt with yellow center dashes, 603-622 curb, 623-719 sidewalk.
- Inner city (olive square paving): street_olive_plain / _oil / _patch / _dirty / _crosswalk
- Ring around inner city (big concrete slabs): street_concrete_plain / _oil / _patch / _dirty
- Outer areas (worn concrete with grass edge): street_worn_plain / _oil / _patch / _dirty

Sidewalk-only seamless 1024x1024 tiles: sidewalk_olive, sidewalk_concrete, sidewalk_worn, sidewalk_hex (plazas/squares).
