# Tingog

Tingog is an Expo / React Native lecture-notes app. It supports live speech
recognition through the device speech service and uploading an existing audio
recording to a Meta MMS transcription API for English, Tagalog, or Hiligaynon.
Transcripts are stored on the device with AsyncStorage.

The app supports a night mode that can be toggled from the library screen.
The appearance preference is saved on the device and applied to all screens.

## How uploaded transcription works

The mobile app does not run the MMS model. It sends the selected audio file to
the configured API as `multipart/form-data`:

- `file`: the audio file
- `language`: `eng`, `tgl`, or `hil` (ISO 639-3)

The API returns JSON with a non-empty `text` string and optional
`duration_seconds` number. The included Python service in `server/` is a
development starting point using `facebook/mms-1b-all`. Audio is converted to
mono 16 kHz with FFmpeg and transcribed in 20-second chunks. The endpoint does
not retain a permanent copy; the ASGI server or a reverse proxy may use
temporary storage while handling uploads.

MMS provides broad language coverage, but recognition quality varies greatly
by language, speaker, recording conditions, and code-switching. Check the
model's current language coverage and evaluate it using real Hiligaynon,
Tagalog, and English recordings before relying on transcripts. The model is
large and requires substantial RAM or a suitable GPU; it is not packaged inside
the phone app. Review the MMS model license and hosting costs before commercial
use.

References: [MMS model card](https://huggingface.co/facebook/mms-1b-all),
[MMS language coverage](https://dl.fbaipublicfiles.com/mms/misc/language_coverage_mms.html),
[Expo DocumentPicker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/),
and [EAS Build](https://docs.expo.dev/build/introduction/).

## 1. Install and run the transcription API locally

Use Python 3.10 or 3.11 and install FFmpeg so the `ffmpeg` command is
available on `PATH`. From the project root:

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

The first server start downloads the MMS model and language adapters from
Hugging Face; this can take a while and needs disk space and network access.
Check readiness at `http://127.0.0.1:8000/health`. If using a CPU-only machine,
expect transcription to take longer than the recording. Install a matching
CUDA-enabled PyTorch build on a compatible GPU server for faster inference.

The prototype accepts audio up to 250 MB and two hours. Keep the server
reachable only on a trusted local network during development. Before public
deployment, put it behind HTTPS and add authentication, request rate limits,
monitoring, and an appropriate upload policy. Do not expose an unauthenticated
inference endpoint to the public internet.

## 2. Point the Expo app at the API

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_TRANSCRIPTION_API_URL` to the
API's base URL, with no `/transcribe` suffix:

```dotenv
EXPO_PUBLIC_TRANSCRIPTION_API_URL=http://192.168.1.10:8000
```

Replace the example IP with the computer's LAN IP when testing from a physical
phone; `localhost` on the phone refers to the phone itself. Restart the Expo
development server after changing `.env`.

The address is public app configuration, not a place for an API key or other
secret. The client posts to `/transcribe`, saves the returned transcript
locally, and does not retain the uploaded audio.

## 3. Run the app

From the project root:

```powershell
npm install
npx expo start
```

Use a development build on a device for the existing native live speech
recognition and document-picker features. Native modules are compiled into the
installed app; restarting Metro or pressing Reload does not add a newly
installed native module. Build and install a fresh Android development APK:

```powershell
npx eas-cli@latest build --platform android --profile development
```

Install the APK produced by EAS over the existing Tingog development app, then
start Metro in development-client mode:

```powershell
npx expo start --dev-client
```

If the app shows `Cannot find native module 'ExpoDocumentPicker'`, it is still
running an older binary. Install the new development APK, fully close the app,
and reopen it from that development server. Expo Go already bundles
DocumentPicker for this SDK, but the project also uses native speech
recognition, so use a development build for the full app.

For a local web preview, use `npm run web`. The upload screen uses Expo's system
document picker and can select audio on Android, iOS, and web.

## 4. Test the upload/transcription flow

1. Start the API and wait for `/health` to return `{"ready":true}`.
2. Set the API base URL in `.env` and restart Expo.
3. Open **Upload audio**, choose an audio recording, and set its title.
4. Select the spoken language (English, Tagalog, or Hiligaynon).
5. Tap **Upload and transcribe**. On success, Tingog opens the saved,
   editable transcript.
6. Compare output against a human transcript, especially for Hiligaynon and
   lectures that mix languages or contain technical vocabulary.

The language is selected explicitly; the prototype does not automatically
detect language or reliably separate mixed-language speech. Live recognition
uses the device's speech service and may not support Hiligaynon. Use uploaded
audio with the MMS-backed API for Hiligaynon.

## 5. Build and export with Expo EAS

1. Create or sign in to an Expo account and verify the project's EAS project
   configuration.
2. Set `EXPO_PUBLIC_TRANSCRIPTION_API_URL` in EAS for the build environment
   (`development`, `preview`, and/or `production`) to the deployed HTTPS API
   base URL. This URL is embedded in the client bundle; never store secrets in
   `EXPO_PUBLIC_*` variables.

   For example, set the preview URL with:

   ```powershell
   npx eas-cli@latest env:set --name EXPO_PUBLIC_TRANSCRIPTION_API_URL --value https://api.example.com --environment preview --visibility plaintext
   ```

   Repeat for production with `--environment production`.
3. Build an installable Android APK for testing:

   ```powershell
   npx eas-cli@latest build --platform android --profile preview
   ```

4. Build the Android Play Store artifact (AAB):

   ```powershell
   npx eas-cli@latest build --platform android --profile production
   ```

5. Build iOS with `npx eas-cli@latest build --platform ios --profile
   production`; an Apple Developer account and signing credentials are
   required.
6. Download the completed artifact from the EAS build page. Submit to stores
   separately with EAS Submit when ready.

Each profile in `eas.json` selects the corresponding EAS environment. Expo Go
is useful for basic previews, but native speech recognition requires a
development/production build containing the project's native module.

## API contract

`POST /transcribe` accepts multipart fields `file` and `language`, where
`language` is one of `eng`, `tgl`, or `hil`. A successful response is:

```json
{
  "text": "Recognized words go here.",
  "language": "hil",
  "duration_seconds": 82.4
}
```

Errors should use a non-2xx HTTP status and a JSON `detail` string.
