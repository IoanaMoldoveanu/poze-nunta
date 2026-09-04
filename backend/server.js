import express from "express";
import { OAuth2Client } from "google-auth-library";

const app = express();
const PORT = process.env.PORT || 8080;

const ALLOWED_ORIGIN = "https://ioanamoldoveanu.github.io";
const FOLDER_ID = "17PYWLPdrwck8wTYDxZ9oRtQCEIz9G03q";

// Tokenul acesta NU este secret.
// Este doar o protecție simplă împotriva uploadurilor întâmplătoare.
const UPLOAD_TOKEN = "NUNTA-2026-IOANA-UPLOAD-8xK4mP2q";

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // backend acceptă max. 10 MB/request

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Upload-Token, X-Upload-Session, Content-Range"
  );

  res.setHeader(
    "Access-Control-Expose-Headers",
    "Range"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

function checkUploadToken(req, res, next) {
  if (req.get("X-Upload-Token") !== UPLOAD_TOKEN) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized."
    });
  }

  next();
}

function getOAuthClient() {
  const rawCredentials = process.env.GOOGLE_DRIVE_CREDENTIALS;

  if (!rawCredentials) {
    throw new Error("GOOGLE_DRIVE_CREDENTIALS nu este disponibil.");
  }

  const credentials = JSON.parse(rawCredentials);

  if (
    !credentials.client_id ||
    !credentials.client_secret ||
    !credentials.refresh_token
  ) {
    throw new Error("Credentialele Google Drive sunt incomplete.");
  }

  const oauth2Client = new OAuth2Client(
    credentials.client_id,
    credentials.client_secret
  );

  oauth2Client.setCredentials({
    refresh_token: credentials.refresh_token
  });

  return oauth2Client;
}

async function getAccessToken() {
  const client = getOAuthClient();
  const result = await client.getAccessToken();

  if (!result.token) {
    throw new Error("Nu s-a putut obtine access token.");
  }

  return result.token;
}

function sanitizeFileName(name) {
  const cleaned = String(name || "fisier")
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 180);

  return cleaned || "fisier";
}

function validMimeType(type) {
  return (
    typeof type === "string" &&
    (type.startsWith("image/") || type.startsWith("video/"))
  );
}

function validDriveSession(url) {
  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "www.googleapis.com" &&
      parsed.pathname.startsWith("/upload/drive/")
    );
  } catch {
    return false;
  }
}


// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "nunta-upload",
    message: "Wedding upload backend is running"
  });
});


// --------------------------------------------------
// 1. PORNEȘTE UN UPLOAD RESUMABLE ÎN GOOGLE DRIVE
// --------------------------------------------------

app.post(
  "/upload/start",
  checkUploadToken,
  express.json({ limit: "20kb" }),
  async (req, res) => {
    try {
      const { name, type, size } = req.body || {};

      const numericSize = Number(size);

      if (!name || !type || !Number.isFinite(numericSize)) {
        return res.status(400).json({
          ok: false,
          error: "Datele fisierului sunt incomplete."
        });
      }

      if (!validMimeType(type)) {
        return res.status(400).json({
          ok: false,
          error: "Sunt acceptate doar poze si videoclipuri."
        });
      }

      if (numericSize <= 0 || numericSize > MAX_FILE_SIZE) {
        return res.status(400).json({
          ok: false,
          error: "Fisierul este prea mare sau invalid."
        });
      }

      const accessToken = await getAccessToken();

      const safeName = sanitizeFileName(name);

      // Prefix pentru a evita coliziuni între fișiere cu același nume.
      const driveName =
        `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": type,
            "X-Upload-Content-Length": String(numericSize)
          },

          body: JSON.stringify({
            name: driveName,
            parents: [FOLDER_ID]
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          "Drive resumable start failed:",
          response.status,
          errorText
        );

        return res.status(502).json({
          ok: false,
          error: `Google Drive nu a pornit uploadul (${response.status}).`
        });
      }

      const sessionUrl = response.headers.get("location");

      if (!sessionUrl || !validDriveSession(sessionUrl)) {
        throw new Error(
          "Google Drive nu a returnat o sesiune valida de upload."
        );
      }

      return res.json({
        ok: true,
        session: sessionUrl
      });

    } catch (error) {
      console.error("Upload start error:", error.message);

      return res.status(500).json({
        ok: false,
        error: "Nu s-a putut porni uploadul."
      });
    }
  }
);


// --------------------------------------------------
// 2. PRIMEȘTE UN CHUNK ȘI ÎL TRIMITE CĂTRE DRIVE
// --------------------------------------------------

app.put(
  "/upload/chunk",
  checkUploadToken,

  express.raw({
    type: "application/octet-stream",
    limit: MAX_CHUNK_SIZE
  }),

  async (req, res) => {
    try {
      const sessionUrl = req.get("X-Upload-Session");
      const contentRange = req.get("Content-Range");

      if (!sessionUrl || !validDriveSession(sessionUrl)) {
        return res.status(400).json({
          ok: false,
          error: "Sesiune de upload invalida."
        });
      }

      if (!contentRange) {
        return res.status(400).json({
          ok: false,
          error: "Content-Range lipseste."
        });
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "Chunk gol sau invalid."
        });
      }

      const accessToken = await getAccessToken();

      const driveResponse = await fetch(sessionUrl, {
        method: "PUT",

        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(req.body.length),
          "Content-Range": contentRange
        },

        body: req.body
      });

      // 308 = Drive a primit chunk-ul, dar fișierul nu este încă terminat.
      if (driveResponse.status === 308) {
        return res.status(200).json({
          ok: true,
          complete: false,
          range: driveResponse.headers.get("range") || null
        });
      }

      // Ultimul chunk -> Drive răspunde cu informațiile fișierului.
      if (driveResponse.ok) {
        let file = null;

        try {
          file = await driveResponse.json();
        } catch {
          // Uneori răspunsul poate să nu aibă JSON util.
        }

        return res.json({
          ok: true,
          complete: true,
          file
        });
      }

      const errorText = await driveResponse.text();

      console.error(
        "Drive chunk failed:",
        driveResponse.status,
        errorText
      );

      return res.status(502).json({
        ok: false,
        error: `Google Drive a refuzat chunk-ul (${driveResponse.status}).`
      });

    } catch (error) {
      console.error("Upload chunk error:", error.message);

      return res.status(500).json({
        ok: false,
        error: "Eroare la incarcarea unei parti din fisier."
      });
    }
  }
);


// --------------------------------------------------
// ERORI PENTRU REQUESTURI PREA MARI
// --------------------------------------------------

app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      ok: false,
      error: "Chunk-ul trimis este prea mare."
    });
  }

  console.error("Unhandled error:", error);

  return res.status(500).json({
    ok: false,
    error: "Eroare interna."
  });
});


app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server pornit pe portul ${PORT}`);
});
