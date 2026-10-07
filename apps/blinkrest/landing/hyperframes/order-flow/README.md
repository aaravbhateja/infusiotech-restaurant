# Order flow animation

HyperFrames scene (HTML + GSAP) behind `landing/video/order-flow.mp4`, the 3D
order-status board in the "Guests watch their order move" panel.

Re-render after editing `index.html` (needs Node 22+, Chrome and FFmpeg):

    cd apps/blinkrest/landing/hyperframes/order-flow
    npx hyperframes@0.8.140 render . -o order-flow.mp4 --fps 30

Then compress and put it where the page expects it:

    ffmpeg -i order-flow.mp4 -c:v libx264 -crf 25 -preset slow -pix_fmt yuv420p -movflags +faststart -an ../../video/order-flow.mp4

The scene is 960x720, 10 seconds, and loops: the last frame matches the first.
