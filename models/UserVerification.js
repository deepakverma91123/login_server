const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserVerificationSchema = new Schema({
  userId: String,
  uniqueId: String,
  createdAt: Date,
  expiresAt: Date,
});

const UserVerification = mongoose.model(
  "UserVerification",
  UserVerificationSchema
);

module.exports = UserVerification;
