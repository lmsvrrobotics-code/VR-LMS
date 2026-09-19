# Service assets

Files here are seeded into Cloudflare R2 on first use, not served from disk.

## founder-meeting-poster.png

The default poster for "Weekly Meeting with Founder". Save the workshop flyer
here with **exactly** that filename, then run:

```
npm run seed:founder-poster
```

The image is uploaded to R2 once and its public URL is remembered in
`app_settings` (`founder_meeting_default_poster`). Every meeting created
without its own poster inherits that URL, and existing meetings pick it up on
their next read.

An admin who uploads a poster in Admin → Marketing → Founder Meetings overrides
this per meeting.

To point the default at an image that is already hosted somewhere, skip the
file and run:

```
npm run seed:founder-poster -- https://your-cdn.example.com/flyer.png
```
