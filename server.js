const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// serve static files
app.use(express.static("public"));

// endpoint
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
