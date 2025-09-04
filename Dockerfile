flyctl deploy --build-only --push -a sms-webhook --image-label deployment-927b0f4b88b7b263d19c3c83e41aa9f3 --config fly.toml

==> Verifying app config

Validating fly.toml

✓ Configuration is valid

--> Verified app config

==> Building image

==> Building image

Error: failed to fetch an image or build from source: app does not have a Dockerfile or buildpacks configured. See https://fly.io/docs/reference/configuration/#the-build-section

unsuccessful command 'flyctl deploy --build-only --push -a sms-webhook --image-label deployment-927b0f4b88b7b263d19c3c83e41aa9f3 --config fly.toml'
