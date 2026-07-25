import "dotenv/config";
import app from "./app";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`WorkForce Manager server in ascolto sulla porta ${port}`);
});
