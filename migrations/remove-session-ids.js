const mongoose = require("mongoose");
const { Session } = require("../models/conversation"); // Adjust path as needed

const runMigration = async () => {
  // 1. Connect to DB
  const DB_URI =
    "mongodb+srv://joydip:k1rPxx6rBZ1RZCiN@nodejs-ecommerce-api.qb2vm.mongodb.net/nodejs-ecommerce-api?retryWrites=true&w=majority&appName=nodejs-ecommerce-apiJWT_SECRET=f98d45daaa9d7f8883221f624ab1b69e3052de6ea6e0bb37d51159f1189e113c";
  await mongoose.connect(DB_URI);

  // 2. Run the migration
  const result = await Session.updateMany(
    {},
    [
      {
        $set: {
          summary: {
            $map: {
              input: "$summary",
              in: {
                role: "$$this.role",
                content: "$$this.content",
              },
            },
          },
          sessionContext: {
            $map: {
              input: "$sessionContext",
              in: {
                role: "$$this.role",
                content: "$$this.content",
              },
            },
          },
        },
      },
    ],
    { multi: true }
  );

  console.log(
    `Migration complete. Modified ${result.modifiedCount} documents.`
  );
  process.exit(0);
};

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
