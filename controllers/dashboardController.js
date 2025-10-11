import { userModel } from '../models/User.js';
import { orderModel } from '../models/Order.js';
import { TransactionModel } from '../models/Transaction.js';
import { ReportModel } from '../models/Report.js';
import { listingModel } from '../models/Listing.js';

export const getSellerOverview = async (req, res) => {
  try {
    const sellerId = req.user._id; // Assuming authenticated seller ID from middleware

    // Fetch user data for base stats
    const user = await userModel.findById(sellerId).select('analytics stats financials rating personalInfo listings orders referralCode createdAt').lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    // Aggregate active listings count (from listings array, but verify active)
    const activeListingsCount = await listingModel.countDocuments({ 
      _id: { $in: user.listings || [] }, 
      isActive: true 
    });

    // Pending orders count for seller
    const pendingOrdersCount = await orderModel.countDocuments({
      items: { $elemMatch: { sellerId: sellerId, status: 'pending', cancelled: false } }
    });

    // Total inquiries and negotiation attempts (sum from listings analytics)
    const listingsAgg = await listingModel.aggregate([
      { $match: { _id: { $in: user.listings || [] } } },
      {
        $group: {
          _id: null,
          totalInquiries: { $sum: '$analytics.inquiries' },
          totalNegotiationAttempts: { $sum: '$analytics.negotiationAttempts' },
          totalViews: { $sum: { $size: '$analytics.views.uniqueViewers' } },
          totalOrdersNumber: { $sum: '$analytics.ordersNumber' },
          totalSoldListings: { $sum: { $cond: [{ $eq: ['$isSold', true] }, 1, 0] } }
        }
      }
    ]);
    const aggData = listingsAgg[0] || { totalInquiries: 0, totalNegotiationAttempts: 0, totalViews: 0, totalOrdersNumber: 0, totalSoldListings: 0 };

    // Successful sales revenue (from user analytics or aggregate transactions)
    const successfulTransactionsAgg = await TransactionModel.aggregate([
      { $match: { 'items.sellerId': sellerId, status: 'completed', 'items.payoutStatus': { $in: ['transferred', 'completed'] } } },
      { $unwind: '$items' },
      { $match: { 'items.sellerId': sellerId } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$items.owedAmount' },
          salesCount: { $sum: 1 }
        }
      }
    ]);
    const transData = successfulTransactionsAgg[0] || { totalRevenue: user.analytics.totalSales.amount, salesCount: user.analytics.salesCount };

    // Recent inquiries (using reports on seller's listings as proxy for inquiries)
    // FIXED: First get seller's productIds to match reportedEntityId (assuming it's productId string)
    const sellerProductIds = await listingModel.distinct('productInfo.productId', { seller: { sellerId: sellerId } });
    const recentInquiries = await ReportModel.find({
      reportType: 'listing',
      reportedEntityId: { $in: sellerProductIds },
      status: { $in: ['Pending', 'Under Review'] }, // Standardized to active statuses
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    }).populate('reporterId', 'personalInfo.fullname personalInfo.profilePicture').sort({ createdAt: -1 }).limit(5).lean();

    const overview = {
      stats: {
        profileViews: user.analytics.profileViews.total,
        totalListings: user.listings?.length || 0,
        activeListings: activeListingsCount,
        soldItems: aggData.totalSoldListings || user.stats.soldListingsCount,
        pendingOrders: pendingOrdersCount || user.stats.pendingOrdersCount,
        totalRevenue: transData.totalRevenue,
        totalInquiries: aggData.totalInquiries,
        totalNegotiationAttempts: aggData.totalNegotiationAttempts,
        listingViews: aggData.totalViews,
        averageRating: user.rating.average,
        balance: user.financials.balance || 0,
        joinedDate: user.createdAt
      },
      recentInquiries,
      referralCode: user.referralCode
    };

    res.status(200).json({ success: true, data: overview });
  } catch (error) {
    console.error('Error fetching seller overview:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getSellerListings = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 10, status = 'all' } = req.query; // Optional filters

    const matchObj = { seller: { sellerId: sellerId } };
    if (status !== 'all') {
      matchObj.isActive = status === 'active';
      matchObj.isSold = status === 'sold' ? true : { $ne: true };
    }

    const listings = await listingModel.find(matchObj)
      .select('productInfo.analytics reviews negotiable isSold rating featured inventory expiresAt isActive aiFindings')
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.profilePicture')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await listingModel.countDocuments(matchObj);

    res.status(200).json({ 
      success: true, 
      data: { listings, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } } 
    });
  } catch (error) {
    console.error('Error fetching seller listings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getSellerTransactions = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 10, status = 'completed' } = req.query;

    const matchStatus = status === 'all' ? { $in: ['pending', 'swift_initiated', 'completed', 'failed', 'reversed'] } : status;

    const transactions = await TransactionModel.find({ 
      status: matchStatus, 
      items: { $elemMatch: { sellerId: sellerId, payoutStatus: { $ne: 'failed' } } } 
    })
      .select('orderId swiftReference totalAmount status items.owedAmount items.payoutStatus items.refundStatus createdAt')
      .populate('items.sellerId', 'personalInfo.fullname')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Filter and project items for seller only
    const sellerTransactions = transactions.map(trans => ({
      ...trans,
      items: trans.items.filter(item => item.sellerId._id && item.sellerId._id.toString() === sellerId.toString())
    })).filter(trans => trans.items.length > 0);

    const total = await TransactionModel.countDocuments({ 
      status: matchStatus, 
      items: { $elemMatch: { sellerId: sellerId, payoutStatus: { $ne: 'failed' } } } 
    });

    res.status(200).json({ 
      success: true, 
      data: { transactions: sellerTransactions, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } } 
    });
  } catch (error) {
    console.error('Error fetching seller transactions:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
export const getSellerAnalytics = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { period = '30days' } = req.query; // e.g., '7days', '30days', 'all'

    let dateFilter;
    const now = new Date();
    switch (period) {
      case '7days': dateFilter = { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) }; break;
      case '30days': dateFilter = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) }; break;
      default: dateFilter = {}; // all time
    }

    // Profile views history (from user.analytics.profileViews.history, filtered)
    // FIXED: Expanded select to include salesCount
    const user = await userModel.findById(sellerId).select('analytics.profileViews.history analytics.totalSales.history analytics.salesCount analytics.profileViews.total').lean();
    console.log("user found: ", user)
    const profileViewsHistory = (user?.analytics?.profileViews?.history || [])
      .filter(h => !dateFilter.$gte || h.date >= dateFilter.$gte)
      .reduce((acc, h) => {
        const date = new Date(h.date).toLocaleDateString();
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      console.log('Profile Views History: ', profileViewsHistory)
    // Listing views and sales trends (aggregate from listings and transactions)
    // FIXED: Remove dateFilter from match to include all historical data for trend; group by createdAt for historical grouping
    const listingsViewsAgg = await listingModel.aggregate([
      { $match: { seller: { sellerId: sellerId } } }, // Removed dateFilter to bring all data
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          views: { $sum: { $size: '$analytics.views.uniqueViewers' } },
          inquiries: { $sum: '$analytics.inquiries' },
          negotiations: { $sum: '$analytics.negotiationAttempts' }
        }
      },
      { $sort: { _id: 1 } }
    ])
    console.log('Listing Views Agrregate: ', listingsViewsAgg)

    const salesTrendAgg = await TransactionModel.aggregate([
      { $match: { status: 'completed', 'items.sellerId': sellerId } }, // Removed dateFilter to bring all historical sales
      { $unwind: '$items' },
      { $match: { 'items.sellerId': sellerId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$items.owedAmount' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    console.log('Sales Trend Agg:', salesTrendAgg)

    // FIXED: totalListingViews aggregate without date filter for overall
    const totalListingViewsAgg = await listingModel.aggregate([
      { $match: { seller: { sellerId: sellerId } } },
      { $group: { _id: null, total: { $sum: { $size: '$analytics.views.uniqueViewers' } } } }
    ]);
    const totalListingViews = totalListingViewsAgg[0]?.total || 0;

    // FIXED: Aggregate for totalInquiries (to match aggData from overview)
    const listingsAggOverall = await listingModel.aggregate([
      { $match: { seller: { sellerId: sellerId } } },
      {
        $group: {
          _id: null,
          totalInquiries: { $sum: '$analytics.inquiries' },
        }
      }
    ]);
    const aggDataOverall = listingsAggOverall[0] || { totalInquiries: 0 };

    const analytics = {
      profileViews: Object.entries(profileViewsHistory).map(([date, count]) => ({ date, count })),
      listingViewsTrend: listingsViewsAgg.map(d => ({ date: d._id, views: d.views, inquiries: d.inquiries, negotiations: d.negotiations })),
      salesTrend: salesTrendAgg.map(d => ({ date: d._id, revenue: d.revenue, orders: d.orders })),
      overall: {
        totalProfileViews: user?.analytics?.profileViews?.total || 0,
        totalListingViews,
        // FIXED: For seller, use salesCount / total inquiries as conversion (assuming inquiries proxy for leads)
        conversionRate: aggDataOverall.totalInquiries ? (user?.analytics?.salesCount / aggDataOverall.totalInquiries) * 100 : 0
      }
    };
    
    console.log(analytics)
    res.status(200).json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching seller analytics:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getSellerInquiries = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    // Fetch recent reports on seller's listings as inquiries
    const sellerListings = await listingModel.distinct('productInfo.productId', { seller: { sellerId: sellerId } });

    const inquiries = await ReportModel.find({
      reportType: 'listing',
      reportedEntityId: { $in: sellerListings },
      status: { $in: ['Pending', 'Under Review'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // FIXED: Consistent 30-day filter
    })
      .populate('reporterId', 'personalInfo.fullname personalInfo.email personalInfo.profilePicture')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // FIXED: Total with date filter for consistency
    const total = await ReportModel.countDocuments({
      reportType: 'listing',
      reportedEntityId: { $in: sellerListings },
      status: { $in: ['Pending', 'Under Review'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    // Augment with listing details
    const enrichedInquiries = await Promise.all(inquiries.map(async (inquiry) => {
      const listing = await listingModel.findOne({ 'productInfo.productId': inquiry.reportedEntityId }).select('productInfo.name images').lean();
      return { ...inquiry, listing: listing?.productInfo };
    }));

    res.status(200).json({ 
      success: true, 
      data: { inquiries: enrichedInquiries, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } } 
    });
  } catch (error) {
    console.error('Error fetching seller inquiries:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};