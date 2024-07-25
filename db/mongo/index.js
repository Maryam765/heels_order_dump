import mongoose from "mongoose";

mongoose.set("strictQuery", true);
mongoose
  .connect(process.env.MONGO_URI, {})
  .then((res) => {
    console.log("Database connected");
  })
  .catch((error) => {
    console.log(error);
  });

// listening for mongoose events
mongoose.connection.on("connected", () => {
  console.log("Mongo has connected successfully!!");
});
mongoose.connection.on("reconnected", () => {
  console.log("Mongo has reconnected");
});
mongoose.connection.on("error", (error) => {
  console.log("Mongo connection has an error", error);
  mongoose.disconnect();
});
mongoose.connection.on("disconnected", () => {
  console.log("Mongo connection is disconnected");
});
