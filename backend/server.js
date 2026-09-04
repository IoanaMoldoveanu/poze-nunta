import express from "express";
import { google } from "google-auth-library";

const app = express();
const PORT = process.env.PORT || 8080;

const ALLOWED_ORIGIN = "https://ioanamoldoveanu.github.io";
const FOLDER_ID = "1vdVOZvQntS1iexjon18xUsmDzJDL_rK6";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Upload-Token, X-File-Name, X-File-Type, Content-Range"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "nunta-upload",
    message: "Backend-ul pentru nunta functioneaza"
  });
});

app.get("/drive-test", async (req, res) => {
  try {
    if (!process.env.GOOGLE_DRIVE_CREDENTIALS) {
      throw new Error("GOOGLE_DRIVE_CREDENTIALS nu este disponibil.");
    }

    const credentials = JSON.parse(
      process.env.GOOGLE_DRIVE_CREDENTIALS
    );

    const clientConfig =
      credentials.installed || credentials.web;

    if (!clientConfig) {
      throw new Error("Configuratia OAuth nu a fost gasita.");
    }

    const oauth2Client = new google.auth.OAuth2(
      clientConfig.client_id,
      clientConfig.client_secret
    );

    oauth2Client.setCredentials({
      refresh_token: credentials.refresh_token
    });

    const accessToken = await oauth2Client.getAccessToken();

    if (!accessToken.token) {
      throw new Error("Nu s-a putut obtine access token.");
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${FOLDER_ID}?fields=id,name,mimeType`,
      {
        headers: {
          Authorization: `Bearer ${accessToken.token}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        `Drive API: ${response.status} ${JSON.stringify(data)}`
      );
    }

    res.json({
      ok: true,
      message: "Conexiunea cu Google Drive functioneaza.",
      folder: data
    });

  } catch (error) {
    console.error("Drive test error:", error.message);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server pornit pe portul ${PORT}`);
});
