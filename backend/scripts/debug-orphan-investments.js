import mongoose from "mongoose";
import Investment from "../models/Investment.js";

const userId = process.argv[2] || "ana";
const uri =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const main = async () => {
  await mongoose.connect(uri);

  const orphanInvestments = await Investment.find({
    user: userId,
    $or: [{ account: { $exists: false } }, { account: null }],
  }).select(
    "name isAutomatedPortfolio currentPrice quantity account subAccount",
  );

  const list = orphanInvestments.map((inv) => {
    const currentValue = inv.isAutomatedPortfolio
      ? inv.currentPrice || 0
      : (inv.quantity || 0) * (inv.currentPrice || 0);
    return {
      id: inv._id.toString(),
      name: inv.name,
      currentValue: parseFloat(currentValue.toFixed(2)),
      account: inv.account,
      subAccount: inv.subAccount,
    };
  });

  const total = list.reduce((sum, inv) => sum + inv.currentValue, 0);

  console.log(
    JSON.stringify(
      {
        userId,
        orphanCount: list.length,
        orphanTotalValue: parseFloat(total.toFixed(2)),
        orphanInvestments: list,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
