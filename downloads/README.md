# Download assets

Public files formerly managed with Git LFS are distributed as GitHub Release assets.
`release-assets.json` records each file's download URL, size, SHA-256 and former local paths.
Software and Document download buttons link directly to these assets.

Password-protected Display software and documents remain in the private Cloudflare R2
bucket and are streamed by `5_Software/worker/worker.js` after authorization. Never
upload protected files to a public release.

Binary originals may remain in the local working folder, but new `.exe` and `.zip`
files are ignored by Git. Existing non-LFS ZIP downloads remain tracked and linked
as before. Do not re-enable Git LFS for download assets.

For a new public version, create a draft release, upload the binaries with
`gh release upload <tag> <relative-file-path> --repo hois56/InoRobotAssistant`,
and compare the uploaded size and SHA-256 digest with the local file before publishing.
Use relative paths because `gh` treats `#` in an upload path as a label separator.
Update the manifest, download URLs, script cache versions and software download
fixture together. Update user-facing version history and run
`node tools/build-version-history.cjs`.

Removing pointers from the current branch does not reclaim old GitHub LFS storage.
Old Git history is preserved; no repository deletion or further history rewrite is
part of this migration.
