import express from "express";
import { createNotification, getNotifications, markAllAsRead, markAsRead, savePushSubscription } from "../controllers/notificationController.js";
const notificationRouter = express.Router();

notificationRouter.post("/subscribe", savePushSubscription);
notificationRouter.post("/create", createNotification);
notificationRouter.get("/:userId", getNotifications);
notificationRouter.put("/read/:notificationId", markAsRead);
notificationRouter.put('/read-all', markAllAsRead)

export default notificationRouter;