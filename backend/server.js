import express from "express";
import { OAuth2Client } from "google-auth-library";

const app = express();
const PORT = process.env.PORT || 8080;

const ALLOWED_ORIGIN = "https://ioanamoldoveanu.github.io";

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
    throw new Error(
      "Credentialele OAuth nu contin client_id, client_secret si refresh_token."
    );
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

app.get("/drive-test", async (req, res) => {
  try {
    const oauth2Client = getOAuthClient();

    const accessToken = await oauth2Client.getAccessToken();

    if (!accessToken.token) {
      throw new Error("Nu s-a putut obtine access token.");
    }

    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: "Poze Nunta - Upload Invitati",
          mimeType: "application/vnd.google-apps.folder"
        })
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
      message: "Folderul a fost creat cu succes.",
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
