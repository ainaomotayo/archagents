import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

const port = parseInt(process.env.PORT ?? "8080", 10);

if (process.env.NODE_ENV !== "test") {
  app.listen({ port, host: "0.0.0.0" }).then(() => {
    console.log(`SENTINEL API listening on :${port}`);
  });
}

export { app };
