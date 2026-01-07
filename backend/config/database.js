import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI ||
        "mongodb://localhost:27017/investments-manager",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      },
    );
    return conn;
  } catch (error) {
    process.exit(1);
  }
};

export default connectDB;
