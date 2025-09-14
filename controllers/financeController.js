import { userModel } from "../models/User.js"


export const getFinancailDetails = async (req, res) => {
    try {
        const user = await userModel.findById(req.user._id).select("personalInfo financials analytics.totalSales").lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const data = {
            subaccount_code: user.personalInfo.subaccount_code || null,
            bankDetails: user.personalInfo.bankDetails,
            mobileMoneyDetails: user.personalInfo.mobileMoneyDetails,
            analytics: user.analytics,
            financial: user.financials
        }
        return res.status(200).json({success: true, message: "Financial details fetched successfully", data });
    } catch (error) {
        console.error("Error fetching financial details:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}