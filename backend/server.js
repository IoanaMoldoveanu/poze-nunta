import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

// Domeniul de pe care vor veni uploadurile
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

// Test simplu ca să verificăm întâi că backendul funcționează.
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "nunta-upload",
    message: "Backend-ul pentru nunta functioneaza"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server pornit pe portul ${PORT}`);
});
