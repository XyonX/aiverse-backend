// const request = require("supertest");
// const app = require("../app");

// describe("Health Endpoint", () => {
//   it("GET / should return server running", async () => {
//     const res = await request(app).get("/");
//     expect(res.statusCode).toBe(200);
//     expect(res.text).toBe("Server is running");
//   });
// });


const request = require("supertest");
const app = require("../app");

describe("Health Endpoint", () => {
  it("GET / should return server running", async () => {
    const res = await request(app).get("/");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe("Server is running");
  });
});
