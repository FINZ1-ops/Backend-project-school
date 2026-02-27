const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Online Shop API",
      version: "1.0.0",
      description: "Documentation API UKT Project"
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local server"
      }
    ],
  },

 apis: ["./src/route/*.js"]
 // lokasi semua file router
};

const swaggerSpec = swaggerJsDoc(options);

function swaggerDocs(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

module.exports = swaggerDocs;
