// templates.js
import sanitizeHtml from 'sanitize-html';
import { createSlug } from './helper.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';
// Sanitize-html configuration
const sanitizeConfig = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'span', 'div', 'hr']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'style'],
    img: ['src', 'alt', 'style'],
    div: ['style'],
    p: ['style'],
    span: ['style'],
    table: ['style', 'cellpadding', 'cellspacing', 'width', 'role'],
    tr: ['style'],
    td: ['style', 'align'],
    hr: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        href: attribs.href ? sanitizeHtml(attribs.href, { allowedSchemes: ['http', 'https', 'mailto'] }) : attribs.href,
      },
    }),
  },
};

// Capitalize product names
const capitalizeWords = (str) => {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};


// HTML Email Template Function for Seller (unchanged)
export const generateOrderEmailSeller = (sellerName, buyerName, items, orderTime, deliveryAddress, totalPrice, buyerId, orderId, paymentUrl) => {
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedOrderTime = sanitizeHtml(orderTime, sanitizeConfig);
  const sanitizedCounty = sanitizeHtml(deliveryAddress.county || '', sanitizeConfig);
  const sanitizedNearestTown = sanitizeHtml(deliveryAddress.nearestTown || '', sanitizeConfig);
  const sanitizedCountry = sanitizeHtml(deliveryAddress.country || 'Kenya', sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedBuyerId = sanitizeHtml(buyerId, sanitizeConfig);
  const sanitizedPaymentUrl = sanitizeHtml(paymentUrl, { ...sanitizeConfig, allowedSchemes: ['https'] });

  const itemDetails = items.map(item => `
    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;">
      <strong>Item Name:</strong> ${sanitizeHtml(item.name, sanitizeConfig)} <br>
      <strong>Quantity:</strong> ${sanitizeHtml(String(item.quantity), sanitizeConfig)} <br>
      <strong>Price:</strong> KES ${sanitizeHtml(String(item.price), sanitizeConfig)} <br>
      <strong>Color:</strong> ${sanitizeHtml(item.color, sanitizeConfig)}${item.size ? ` <br><strong>Size:</strong> ${sanitizeHtml(item.size, sanitizeConfig)}` : ''}
    </p>
  `).join('<hr style="border: 1px solid #e5e7eb; margin: 10px 0;">');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Order Notification</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Exciting News, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">You've Got a New Order!</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName}, a buyer has placed an order for your item(s) on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. The payment is pending confirmation. Once confirmed, funds will be held until delivery. Here’s the order summary:
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Order Summary (Order ID: ${sanitizedOrderId})</p>
                    ${itemDetails}
                    <p style="font-size: 13px; color: #475569; margin: 10px 0 8px;"><strong>Buyer Name:</strong> ${sanitizedBuyerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Order Placed On:</strong> ${sanitizedOrderTime}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Total Price:</strong> KES ${sanitizeHtml(String(totalPrice), sanitizeConfig)}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Shipping Address:</strong> ${sanitizedCounty || sanitizedNearestTown ? `${sanitizedCounty}, ${sanitizedNearestTown}, ` : ''}${sanitizedCountry} (Full details via chat)</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedBuyerId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Message Buyer Now</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Wait for payment confirmation, then arrange shipping with the buyer via chat. Funds will be released to your M-Pesa account after delivery confirmation.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your seller dashboard or contact support.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep shining on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Buyer (updated for no payment URL)
export const generateOrderEmailBuyer = (buyerName, items, orderTime, totalPrice, deliveryAddress, orderId, sellerIds, paymentUrl) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedOrderTime = sanitizeHtml(orderTime, sanitizeConfig);
  const sanitizedCounty = sanitizeHtml(deliveryAddress.county || '', sanitizeConfig);
  const sanitizedNearestTown = sanitizeHtml(deliveryAddress.nearestTown || '', sanitizeConfig);
  const sanitizedCountry = sanitizeHtml(deliveryAddress.country || 'Kenya', sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);

  const itemDetails = items.map(item => `
    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;">
      <strong>Item Name:</strong> ${sanitizeHtml(item.name, sanitizeConfig)} <br>
      <strong>Quantity:</strong> ${sanitizeHtml(String(item.quantity), sanitizeConfig)} <br>
      <strong>Price:</strong> KES ${sanitizeHtml(String(item.price), sanitizeConfig)} <br>
      <strong>Color:</strong> ${sanitizeHtml(item.color, sanitizeConfig)}${item.size ? ` <br><strong>Size:</strong> ${sanitizeHtml(item.size, sanitizeConfig)}` : ''}
      <strong>Seller ID:</strong> ${sanitizeHtml(item.sellerId.toString(), sanitizeConfig)}
    </p>
  `).join('<hr style="border: 1px solid #e5e7eb; margin: 10px 0;">');

  const sellerChatLinks = sellerIds.length > 0 ? `
    <p style="font-size: 13px; color: #475569; margin: 10px 0;">
      <strong>Contact Seller(s):</strong><br>
      ${sellerIds.map(sellerId => `
        <a href="${FRONTEND_URL}/chat/${sanitizeHtml(sellerId, sanitizeConfig)}" style="color: #1e40af; text-decoration: underline;">Chat with Seller ${sanitizeHtml(sellerId, sanitizeConfig)}</a><br>
      `).join('')}
    </p>
  ` : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Order Confirmation</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Thank You, ${sanitizedBuyerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Order Has Been Placed!</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedBuyerName}, we’re thrilled to confirm your order on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. Check your phone for the M-Pesa STK Push prompt to complete payment.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Order Summary (Order ID: ${sanitizedOrderId})</p>
                    ${itemDetails}
                    <p style="font-size: 13px; color: #475569; margin: 10px 0 8px;"><strong>Order Placed On:</strong> ${sanitizedOrderTime}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Total Price:</strong> KES ${sanitizeHtml(String(totalPrice), sanitizeConfig)}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Shipping Address:</strong> ${sanitizedCounty || sanitizedNearestTown ? `${sanitizedCounty}, ${sanitizedNearestTown}, ` : ''}${sanitizedCountry}</p>
                    ${sellerChatLinks}
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Enter your M-Pesa PIN on your phone to confirm payment. Once processed, the seller(s) will contact you via chat to arrange shipping. Please verify the product before finalizing delivery.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Help?</strong> Check your buyer dashboard or contact our support team.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Happy shopping on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Admin (unchanged)
export const generateOrderEmailAdmin = (buyerName, items, orderTime, totalPrice, deliveryAddress, orderId, buyerId) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedOrderTime = sanitizeHtml(orderTime, sanitizeConfig);
  const sanitizedCounty = sanitizeHtml(deliveryAddress.county || '', sanitizeConfig);
  const sanitizedNearestTown = sanitizeHtml(deliveryAddress.nearestTown || '', sanitizeConfig);
  const sanitizedCountry = sanitizeHtml(deliveryAddress.country || 'Kenya', sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedBuyerId = sanitizeHtml(buyerId, sanitizeConfig);

  const itemDetails = items.map(item => `
    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;">
      <strong>Item Name:</strong> ${sanitizeHtml(item.name, sanitizeConfig)} <br>
      <strong>Quantity:</strong> ${sanitizeHtml(String(item.quantity), sanitizeConfig)} <br>
      <strong>Price:</strong> KES ${sanitizeHtml(String(item.price), sanitizeConfig)} <br>
      <strong>Color:</strong> ${sanitizeHtml(item.color, sanitizeConfig)}${item.size ? ` <br><strong>Size:</strong> ${sanitizeHtml(item.size, sanitizeConfig)}` : ''} <br>
      <strong>Seller:</strong> <a href="${FRONTEND_URL}/chat/${sanitizeHtml(item.sellerId.toString(), sanitizeConfig)}" style="color: #1e40af; text-decoration: underline;">${sanitizeHtml(item.sellerId.toString(), sanitizeConfig)}</a>
    </p>
  `).join('<hr style="border: 1px solid #e5e7eb; margin: 10px 0;">');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Order Placed - Admin Notification</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New Order Placed on BeiFity!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Order Notification (Payment Pending)</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    A new order has been placed on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. The buyer is completing payment via M-Pesa. Funds will be held until delivery confirmation.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Order Summary (Order ID: ${sanitizedOrderId})</p>
                    ${itemDetails}
                    <p style="font-size: 13px; color: #475569; margin: 10px 0 8px;"><strong>Buyer:</strong> <a href="${FRONTEND_URL}/chat/${sanitizedBuyerId}" style="color: #1e40af; text-decoration: underline;">${sanitizedBuyerName}</a></p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Order Placed On:</strong> ${sanitizedOrderTime}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Total Price:</strong> KES ${sanitizeHtml(String(totalPrice), sanitizeConfig)}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Shipping Address:</strong> ${sanitizedCounty || sanitizedNearestTown ? `${sanitizedCounty}, ${sanitizedNearestTown}, ` : ''}${sanitizedCountry}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/orders" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">View Order Details</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Monitor payment confirmation and order status in the admin dashboard. Contact the buyer or seller(s) if necessary.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Check the admin dashboard or reach out to the support team.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep managing on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Order Status Update (updated for M-Pesa)
export const generateOrderStatusEmail = (recipientName, itemName, orderId, status, chatUserId) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedStatus = sanitizeHtml(status, sanitizeConfig);
  const sanitizedChatUserId = sanitizeHtml(chatUserId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Status Update</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Update, ${sanitizedRecipientName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Order Status Has Changed</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedRecipientName},<br>
                    The status of your order item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}) has been updated to <strong>${sanitizedStatus}</strong>.
                    ${status === 'delivered' ? 'The seller has been paid via M-Pesa.' : status === 'shipped' ? 'Please confirm delivery once received.' : ''}
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedChatUserId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    ${status === 'shipped' ? 'Message Seller' : 'Message Buyer'}
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Contact the ${status === 'shipped' ? 'seller' : 'buyer'} via chat for any questions or to confirm details.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Help?</strong> Visit your ${status === 'shipped' ? 'buyer' : 'seller'} dashboard or contact our support team.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">${status === 'shipped' ? 'Happy shopping' : 'Keep selling'} on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Order Cancellation (updated for manual refund)
export const generateOrderCancellationEmail = (recipientName, itemName, orderId, cancelledBy, refundMessage, chatUserId) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedCancelledBy = sanitizeHtml(cancelledBy, sanitizeConfig);
  const sanitizedRefundMessage = sanitizeHtml(refundMessage, sanitizeConfig);
  const sanitizedChatUserId = sanitizeHtml(chatUserId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Item Cancellation</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Cancellation Notice</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Hi ${sanitizedRecipientName},</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    The ${sanitizedCancelledBy} has cancelled the order item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}). ${sanitizedRefundMessage}
                    You can contact them if you have questions.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedChatUserId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    Message ${sanitizedCancelledBy.charAt(0).toUpperCase() + sanitizedCancelledBy.slice(1)}
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your ${sanitizedCancelledBy === 'seller' ? 'buyer' : 'seller'} dashboard or contact our support team for help.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">${sanitizedCancelledBy === 'seller' ? 'Happy shopping' : 'Keep selling'} on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// New HTML Email Template Function for Refund Notification (Buyer and Seller) (updated for manual)
export const generateRefundEmail = (recipientName, itemName, orderId, refundAmount, isFullRefund, recipientRole, chatUserId) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedRefundAmount = sanitizeHtml(refundAmount.toFixed(2), sanitizeConfig);
  const sanitizedRecipientRole = sanitizeHtml(recipientRole, sanitizeConfig);
  const sanitizedChatUserId = sanitizeHtml(chatUserId, sanitizeConfig);

  const isBuyer = sanitizedRecipientRole.toLowerCase() === 'buyer';
  const title = isBuyer ? 'Refund Initiated' : 'Order Item Refund Notification';
  const message = isBuyer
    ? `A ${isFullRefund ? 'full' : 'partial'} refund of <strong>KES ${sanitizedRefundAmount}</strong> for the item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}) has been initiated manually and will be processed to your M-Pesa account as soon as possible.`
    : `The item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}) has been cancelled by the buyer. An amount of <strong>KES ${sanitizedRefundAmount}</strong> has been deducted from your pending balance as part of the ${isFullRefund ? 'full' : 'partial'} manual refund process.`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">${title}, ${sanitizedRecipientName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">${isBuyer ? 'Refund Initiated' : 'Refund Processed'}</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedRecipientName},<br>
                    ${message}
                    You can contact the ${isBuyer ? 'seller' : 'buyer'} if you have questions.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedChatUserId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    Message ${isBuyer ? 'Seller' : 'Buyer'}
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your ${isBuyer ? 'buyer' : 'seller'} dashboard or contact our support team at <a href="mailto:${isBuyer ? 'customer.care@beifity.com' : 'customer.care@beifity.com'}" style="color: #1e40af; text-decoration: underline;">${isBuyer ? 'customer.care@beifity.com' : 'customer.care@beifity.com'}</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">${isBuyer ? 'Happy shopping' : 'Keep selling'} on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Payout Notification (Seller) (updated for manual)
export const generatePayoutNotificationEmail = (sellerName, orderId, payoutAmount, itemIds, swiftTransferId) => {
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedPayoutAmount = sanitizeHtml(payoutAmount.toFixed(2), sanitizeConfig);
  const sanitizedSwiftTransferId = sanitizeHtml(swiftTransferId || 'N/A', sanitizeConfig);
  const sanitizedItemIds = itemIds.map(id => sanitizeHtml(id, sanitizeConfig)).join(', ');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payout Processed - BeiFity.Com</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Payout Processed, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Payout Has Been Processed</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName},<br>
                    A manual payout of <strong>KES ${sanitizedPayoutAmount}</strong> for items (Item IDs: ${sanitizedItemIds}) in Order ID: ${sanitizedOrderId} has been processed to your M-Pesa account.<br>
                    Transaction Reference: <strong>${sanitizedSwiftTransferId}</strong>
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/seller/payouts" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Payout Details
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your seller dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep selling on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Transaction Reversal Notification (Buyer and Seller) (updated for manual)
export const generateTransactionReversalEmail = (recipientName, orderId, itemIds, recipientRole, chatUserId) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedItemIds = itemIds.map(id => sanitizeHtml(id, sanitizeConfig)).join(', ');
  const sanitizedRecipientRole = sanitizeHtml(recipientRole, sanitizeConfig);
  const sanitizedChatUserId = sanitizeHtml(chatUserId, sanitizeConfig);

  const isBuyer = sanitizedRecipientRole.toLowerCase() === 'buyer';
  const title = isBuyer ? 'Transaction Reversed - Full Refund' : 'Transaction Reversed Notification';
  const message = isBuyer
    ? `The transaction for Order ID: ${sanitizedOrderId} (Items: ${sanitizedItemIds}) has been reversed. A full manual refund has been processed and will be sent to your M-Pesa account as soon as possible.`
    : `The transaction for Order ID: ${sanitizedOrderId} (Items: ${sanitizedItemIds}) has been reversed. The corresponding amounts have been deducted from your pending balance.`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">${title}, ${sanitizedRecipientName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Transaction Reversed</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedRecipientName},<br>
                    ${message}<br>
                    You can contact the ${isBuyer ? 'seller' : 'buyer'} if you have questions.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizedChatUserId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    Message ${isBuyer ? 'Seller' : 'Buyer'}
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your ${isBuyer ? 'buyer' : 'seller'} dashboard or contact our support team at <a href="mailto:${isBuyer ? 'customer.care@beifity.com' : 'customer.care@beifity.com'}" style="color: #1e40af; text-decoration: underline;">${isBuyer ? 'customer.care@beifity.com' : 'customer.care@beifity.com'}</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">${isBuyer ? 'Happy shopping' : 'Keep selling'} on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};
// HTML Email Template Function for Admin Order Status Notification
export const generateOrderStatusEmailAdmin = (adminName, itemName, orderId, status, buyerId, sellerId) => {
  const sanitizedAdminName = sanitizeHtml(adminName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedStatus = sanitizeHtml(status, sanitizeConfig);
  const sanitizedBuyerId = sanitizeHtml(buyerId, sanitizeConfig);
  const sanitizedSellerId = sanitizeHtml(sellerId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Status Update - BeiFity.Com Admin</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Status Update, ${sanitizedAdminName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Order Item Status Changed</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedAdminName},<br>
                    The item "${sanitizedItemName}" in Order ID: ${sanitizedOrderId} has been updated to status: <strong>${sanitizedStatus}</strong>.<br>
                    Buyer ID: ${sanitizedBuyerId}<br>
                    Seller ID: ${sanitizedSellerId}
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/orders/${sanitizedOrderId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Order Details
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Manage your platform on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Admin Order Cancellation Notification (updated for manual refund)
export const generateOrderCancellationEmailAdmin = (adminName, itemName, orderId, cancelledBy, refundMessage, userId) => {
  const sanitizedAdminName = sanitizeHtml(adminName, sanitizeConfig);
  const sanitizedItemName = sanitizeHtml(itemName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedCancelledBy = sanitizeHtml(cancelledBy, sanitizeConfig);
  const sanitizedRefundMessage = sanitizeHtml(refundMessage, sanitizeConfig);
  const sanitizedUserId = sanitizeHtml(userId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Cancellation Notification - BeiFity.Com Admin</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Item Cancelled, ${sanitizedAdminName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Order Cancellation Notification</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedAdminName},<br>
                    The item "${sanitizedItemName}" in Order ID: ${sanitizedOrderId} has been cancelled by the ${sanitizedCancelledBy} (User ID: ${sanitizedUserId}).<br>
                    ${sanitizedRefundMessage}
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/orders/${sanitizedOrderId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Order Details
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Manage your platform on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

export const generateMarketingEmail = (recipientName, products) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName || 'Valued Customer', sanitizeConfig);
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';

  const productCards = products
    .map((product) => {
      const sanitizedProductName = sanitizeHtml(capitalizeWords(product.name), sanitizeConfig);
      const sanitizedPrice = sanitizeHtml(product.price.toFixed(2), sanitizeConfig);
      const sanitizedDescription = sanitizeHtml(product.description.slice(0, 100) + (product.description.length > 100 ? '...' : ''), sanitizeConfig);
      const sanitizedImage = sanitizeHtml(product.image || 'https://via.placeholder.com/300', sanitizeConfig);
      const sanitizedProductUrl = sanitizeHtml(product.url, { ...sanitizeConfig, allowedSchemes: ['https'] });

      return `
        <tr>
          <td style="padding: 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1); transition: transform 0.3s ease;">
              <tr>
                <td style="position: relative; text-align: center; padding: 0;">
                  <div style="position: relative; overflow: hidden; border-radius: 16px 16px 0 0;">
                    <img src="${sanitizedImage}" alt="${sanitizedProductName}" style="width: 100%; max-width: 300px; height: auto; display: block; margin: 0 auto; transition: transform 0.3s ease;">
                    <span style="position: absolute; top: 12px; right: 12px; background: linear-gradient(90deg, #10b981, #34d399); color: #ffffff; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);">In Stock</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px; text-align: center;">
                  <h3 style="font-size: 22px; font-weight: 700; color: #1e3a8a; margin: 0 0 10px; line-height: 1.3;">${sanitizedProductName}</h3>
                  <p style="font-size: 20px; font-weight: 700; color: #e11d48; margin: 0 0 10px;">KES ${sanitizedPrice}</p>
                  <p style="font-size: 15px; color: #475569; line-height: 1.5; margin: 0 0 16px;">${sanitizedDescription}</p>
                  <a href="${sanitizedProductUrl}" style="display: inline-block; background: linear-gradient(90deg, #1e40af, #60a5fa); color: #ffffff; font-size: 16px; font-weight: 600; padding: 12px 32px; text-decoration: none; border-radius: 10px; transition: all 0.3s ease;">
                    Shop Now
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Exclusive Deals Await at BeiFity.Com!</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
        body { font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f0f2f5 url('https://www.transparenttextures.com/patterns/soft-wallpaper.png'); }
        .container { max-width: 600px; margin: 0 auto; }
        a:hover { transform: scale(1.05); background: #1e3a8a !important; }
        .product-table:hover { transform: translateY(-4px); }
        img { max-width: 100%; height: auto; }
        .social-icon { transition: transform 0.3s ease; }
        .social-icon:hover { transform: scale(1.1); }
        @media only screen and (max-width: 600px) {
          .container { max-width: 100% !important; padding: 10px !important; }
          .hero img { max-width: 80% !important; }
          .hero h1 { font-size: 24px !important; }
          .hero p { font-size: 16px !important; }
          .product-table img { max-width: 90% !important; }
          .stock-badge { position: static !important; display: inline-block; margin: 10px auto !important; }
        }
      </style>
    </head>
    <body style="background: #f0f2f5 url('https://www.transparenttextures.com/patterns/soft-wallpaper.png');">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" class="container" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background: #ffffff; border-radius: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12); overflow: hidden;">
              <!-- Header -->
              <tr>
                <td style="padding: 20px; text-align: center; background: #ffffff;">
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 60px; display: block; margin: 0 auto;">
                </td>
              </tr>
              <!-- Hero Section -->
              <tr>
                <td class="hero" style="background: linear-gradient(135deg, #1e40af, #60a5fa); padding: 40px 20px; text-align: center;">
                  <h1 style="font-size: 28px; font-weight: 700; color: #ffffff; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Hey ${sanitizedRecipientName}!</h1>
                  <p style="font-size: 18px; color: #e2e8f0; line-height: 1.5; margin: 0 0 20px;">Your exclusive deals are here! Shop the best at <span style="color: #fbbf24;">BeiFity</span>!</p>
                  <a href="${FRONTEND_URL}/collection" style="display: inline-block; background: linear-gradient(90deg, #fbbf24, #f59e0b); color: #1e293b; font-size: 16px; font-weight: 600; padding: 14px 32px; text-decoration: none; border-radius: 10px; transition: all 0.3s ease;">
                    Discover Now
                  </a>
                </td>
              </tr>
              <!-- Products -->
              <tr>
                <td style="padding: 20px 20px 30px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    ${productCards}
                  </table>
                </td>
              </tr>
              <!-- CTA -->
              <tr>
                <td style="padding: 20px; text-align: center; background: #f8fafc;">
                  <a href="${FRONTEND_URL}/collection" style="display: inline-block; background: linear-gradient(90deg, #1e40af, #60a5fa); color: #ffffff; font-size: 16px; font-weight: 600; padding: 14px 32px; text-decoration: none; border-radius: 10px; transition: all 0.3s ease; text-transform: uppercase;">
                    Explore More Deals
                  </a>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 20px; text-align: center; background: linear-gradient(135deg, #f8fafc, #e5e7eb); border-radius: 0 0 20px 20px;">
                 
                  <p style="font-size: 14px; color: #475569; margin: 0 0 8px;">
                    <a href="${FRONTEND_URL}/edit-profile" style="color: #1e40af; text-decoration: underline;">Unsubscribe</a> from these emails.
                  </p>
                  <p style="font-size: 14px; color: #475569; margin: 0 0 8px;">
                    BeiFity.Com | Nairobi, Kenya | <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>
                  </p>
                  <p style="font-size: 14px; color: #475569; margin: 0;">
                    <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity</span>.Com</span> © ${new Date().getFullYear()}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};
export const generateMarketingAdminReportEmail = (products, recipients) => {
  const sanitizedRecipients = recipients.map(r => sanitizeHtml(r, sanitizeConfig)).join(', ');
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';

  const productDetails = products
    .map((product) => {
      const sanitizedProductName = sanitizeHtml(capitalizeWords(product.name), sanitizeConfig);
      const sanitizedPrice = sanitizeHtml(product.price.toFixed(2), sanitizeConfig);
      const sanitizedDescription = sanitizeHtml(product.description.slice(0, 100) + (product.description.length > 100 ? '...' : ''), sanitizeConfig);
      const sanitizedImage = sanitizeHtml(product.image || 'https://via.placeholder.com/300', sanitizeConfig);
      const sanitizedProductUrl = sanitizeHtml(product.url, { ...sanitizeConfig, allowedSchemes: ['https'] });

      return `
        <tr>
          <td style="padding: 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1); transition: transform 0.3s ease;">
              <tr>
                <td style="position: relative; text-align: center; padding: 0;">
                  <div style="position: relative; overflow: hidden; border-radius: 16px 16px 0 0;">
                    <img src="${sanitizedImage}" alt="${sanitizedProductName}" style="width: 100%; max-width: 300px; height: auto; display: block; margin: 0 auto; transition: transform 0.3s ease;">
                    <span style="position: absolute; top: 12px; right: 12px; background: linear-gradient(90deg, #10b981, #34d399); color: #ffffff; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);">In Stock</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px; text-align: center;">
                  <h3 style="font-size: 22px; font-weight: 700; color: #1e3a8a; margin: 0 0 10px; line-height: 1.3;">${sanitizedProductName}</h3>
                  <p style="font-size: 20px; font-weight: 700; color: #e11d48; margin: 0 0 10px;">KES ${sanitizedPrice}</p>
                  <p style="font-size: 15px; color: #475569; line-height: 1.5; margin: 0 0 16px;">${sanitizedDescription}</p>
                  <a href="${sanitizedProductUrl}" style="display: inline-block; background: linear-gradient(90deg, #1e40af, #60a5fa); color: #ffffff; font-size: 16px; font-weight: 600; padding: 12px 32px; text-decoration: none; border-radius: 10px; transition: all 0.3s ease;">
                    View Product
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Marketing Campaign Report - BeiFity.Com</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
        body { font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f0f2f5 url('https://www.transparenttextures.com/patterns/soft-wallpaper.png'); }
        .container { max-width: 600px; margin: 0 auto; }
        a:hover { transform: scale(1.05); background: #1e3a8a !important; }
        .product-table:hover { transform: translateY(-4px); }
        img { max-width: 100%; height: auto; }
        .social-icon { transition: transform 0.3s ease; }
        .social-icon:hover { transform: scale(1.1); }
        @media only screen and (max-width: 600px) {
          .container { max-width: 100% !important; padding: 10px !important; }
          .hero h1 { font-size: 24px !important; }
          .hero p { font-size: 16px !important; }
          .product-table img { max-width: 90% !important; }
          .stock-badge { position: static !important; display: inline-block; margin: 10px auto !important; }
        }
      </style>
    </head>
    <body style="background: #f0f2f5 url('https://www.transparenttextures.com/patterns/soft-wallpaper.png');">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" class="container" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background: #ffffff; border-radius: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12); overflow: hidden;">
              <!-- Header -->
              <tr>
                <td style="padding: 20px; text-align: center; background: #ffffff;">
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 60px; display: block; margin: 0 auto;">
                </td>
              </tr>
              <!-- Hero Section -->
              <tr>
                <td class="hero" style="background: linear-gradient(135deg, #1e40af, #60a5fa); padding: 40px 20px; text-align: center;">
                  <h1 style="font-size: 28px; font-weight: 700; color: #ffffff; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Campaign Report</h1>
                  <p style="font-size: 18px; color: #e2e8f0; line-height: 1.5; margin: 0 0 20px;">
                    Sent to ${recipients.length} users on ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}.
                  </p>
                  <a href="${FRONTEND_URL}/admin/dashboard" style="display: inline-block; background: linear-gradient(90deg, #fbbf24, #f59e0b); color: #1e293b; font-size: 16px; font-weight: 600; padding: 14px 32px; text-decoration: none; border-radius: 10px; transition: all 0.3s ease;">
                    View Dashboard
                  </a>
                </td>
              </tr>
              <!-- Recipients -->
              <tr>
                <td style="padding: 20px; text-align: left; background: #f8fafc;">
                  <p style="font-size: 16px; font-weight: 600; color: #1e40af; margin: 0 0 8px;">Recipients:</p>
                  <p style="font-size: 14px; color: #475569; line-height: 1.5; margin: 0;">${sanitizedRecipients}</p>
                </td>
              </tr>
              <!-- Products -->
              <tr>
                <td style="padding: 20px 20px 30px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding: 0 0 16px; text-align: left;">
                        <p style="font-size: 16px; font-weight: 600; color: #1e40af; margin: 0;">Promoted Products:</p>
                      </td>
                    </tr>
                    ${productDetails}
                  </table>
                </td>
              </tr>
              <!-- CTA -->
              <tr>
                <td style="padding: 20px; text-align: center; background: #f8fafc;">
                  <a href="${FRONTEND_URL}/admin/dashboard" style="display: inline-block; background: linear-gradient(90deg, #1e40af, #60a5fa); color: #ffffff; font-size: 16px; font-weight: 600; padding: 14px 32px; text-decoration: none; border-radius: 10px; transition: all 0.3s ease; text-transform: uppercase;">
                    Analyze Campaign
                  </a>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 20px; text-align: center; background: linear-gradient(135deg, #f8fafc, #e5e7eb); border-radius: 0 0 20px 20px;">
                  
                  <p style="font-size: 14px; color: #475569; margin: 0 0 8px;">
                    BeiFity.Com | Nairobi, Kenya | <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>
                  </p>
                  <p style="font-size: 14px; color: #475569; margin: 0;">
                    <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity</span>.Com</span> © ${new Date().getFullYear()}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};


// Add to templates.js
export const generateProductRequestEmail = (
  name,
  phone,
  productName,
  description,
  preferredPriceRange,
  colors,
  condition,
  additionalNotes
) => {
  const sanitizedName = sanitizeHtml(name, sanitizeConfig);
  const sanitizedPhone = sanitizeHtml(phone, sanitizeConfig);
  const sanitizedProductName = sanitizeHtml(capitalizeWords(productName), sanitizeConfig);
  const sanitizedDescription = sanitizeHtml(description || 'Not provided', sanitizeConfig);
  const sanitizedPreferredPriceRange = sanitizeHtml(Number(preferredPriceRange).toFixed(2), sanitizeConfig);
  const sanitizedColors = colors.length > 0
    ? colors.map(color => sanitizeHtml(color, sanitizeConfig)).join(', ')
    : sanitizeHtml('Not specified', sanitizeConfig);
  const sanitizedCondition = sanitizeHtml(condition, sanitizeConfig);
  const sanitizedAdditionalNotes = sanitizeHtml(additionalNotes || 'Not provided', sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Product Request - BeiFity.Com</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New Product Request Received!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">A User Has Requested a Product</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    A new product request has been submitted on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. Please review the details below and take appropriate action.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Request Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Requested By:</strong> ${sanitizedName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Phone Number:</strong> ${sanitizedPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product Name:</strong> ${sanitizedProductName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Description:</strong> ${sanitizedDescription}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Preferred Price Range:</strong> KES ${sanitizedPreferredPriceRange}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Preferred Colors:</strong> ${sanitizedColors}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Condition:</strong> ${sanitizedCondition}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Additional Notes:</strong> ${sanitizedAdditionalNotes}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/admin/requests" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Product Requests
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Review the request in the admin dashboard and contact the user if necessary to discuss availability or sourcing options.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Manage your platform on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};


// HTML Email Template Function for Buyer Negotiation (with seller phone number)
export const generateNegotiationEmailBuyer = (buyerName, listingName, sellerName, sellerPhone, productId) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedListingName = sanitizeHtml(capitalizeWords(listingName), sanitizeConfig);
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedSellerPhone = sanitizeHtml(sellerPhone, sanitizeConfig);
  const sanitizedProductId = sanitizeHtml(productId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Negotiation Recorded - BeiFity.Com</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Negotiation Recorded, ${sanitizedBuyerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Negotiation Attempt Has Been Recorded</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedBuyerName}, we're excited to let you know that your negotiation attempt for "<strong>${sanitizedListingName}</strong>" has been successfully recorded on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Negotiation Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product:</strong> ${sanitizedListingName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Seller Name:</strong> ${sanitizedSellerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Seller Phone:</strong> ${sanitizedSellerPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product ID:</strong> ${sanitizedProductId}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Contact the Seller:</strong> You can now reach out to ${sanitizedSellerName} directly at <strong>${sanitizedSellerPhone}</strong> to discuss the negotiation further.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/product/${createSlug(listingName)}/${sanitizedProductId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Product Again
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> The seller has been notified and will get back to you soon. Feel free to contact them directly using the phone number provided above.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your buyer dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Happy negotiating on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Seller Negotiation (unchanged but included for completeness)
export const generateNegotiationEmailSeller = (sellerName, listingName, buyerName, buyerPhone, productId) => {
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedListingName = sanitizeHtml(capitalizeWords(listingName), sanitizeConfig);
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedBuyerPhone = sanitizeHtml(buyerPhone, sanitizeConfig);
  const sanitizedProductId = sanitizeHtml(productId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Negotiation Attempt - BeiFity.Com</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New Negotiation Attempt, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">A Buyer Wants to Negotiate Your Listing</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName}, great news! A potential buyer has expressed interest in negotiating the price of your listing "<strong>${sanitizedListingName}</strong>" on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Negotiation Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product:</strong> ${sanitizedListingName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Buyer Name:</strong> ${sanitizedBuyerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Buyer Phone:</strong> ${sanitizedBuyerPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product ID:</strong> ${sanitizedProductId}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Contact the Buyer:</strong> You can reach out to ${sanitizedBuyerName} directly at <strong>${sanitizedBuyerPhone}</strong> to discuss the negotiation.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/product/${createSlug(listingName)}/${sanitizedProductId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Your Listing
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Please respond to the buyer promptly to discuss the negotiation. Quick responses increase your chances of making a sale!
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your seller dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep selling on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};
// HTML Email Template Function for Buyer Inquiry (with seller phone number)
export const generateInquiryEmailBuyer = (buyerName, listingName, sellerName, sellerPhone, productId) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedListingName = sanitizeHtml(capitalizeWords(listingName), sanitizeConfig);
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedSellerPhone = sanitizeHtml(sellerPhone, sanitizeConfig);
  const sanitizedProductId = sanitizeHtml(productId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Inquiry Recorded - BeiFity.Com</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Inquiry Recorded, ${sanitizedBuyerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Product Inquiry Has Been Recorded</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedBuyerName}, we're excited to let you know that your inquiry for "<strong>${sanitizedListingName}</strong>" has been successfully recorded on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Inquiry Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product:</strong> ${sanitizedListingName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Seller Name:</strong> ${sanitizedSellerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Seller Phone:</strong> ${sanitizedSellerPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product ID:</strong> ${sanitizedProductId}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Inquiry Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Contact the Seller:</strong> You can now reach out to ${sanitizedSellerName} directly at <strong>${sanitizedSellerPhone}</strong> to discuss the product further and get more information.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/product/${createSlug(listingName)}/${sanitizedProductId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Product Details
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> The seller has been notified of your interest and will get back to you soon. Feel free to contact them directly using the phone number provided above for quicker response.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your buyer dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Happy shopping on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Seller Inquiry (with buyer phone number)
export const generateInquiryEmailSeller = (sellerName, listingName, buyerName, buyerPhone, productId) => {
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedListingName = sanitizeHtml(capitalizeWords(listingName), sanitizeConfig);
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedBuyerPhone = sanitizeHtml(buyerPhone, sanitizeConfig);
  const sanitizedProductId = sanitizeHtml(productId, sanitizeConfig);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Product Inquiry - BeiFity.Com</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">New Product Inquiry, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">A Buyer is Interested in Your Listing</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName}, great news! A potential buyer has shown interest in your listing "<strong>${sanitizedListingName}</strong>" on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Inquiry Details</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product:</strong> ${sanitizedListingName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Buyer Name:</strong> ${sanitizedBuyerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Buyer Phone:</strong> ${sanitizedBuyerPhone}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Product ID:</strong> ${sanitizedProductId}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Inquiry Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Contact the Buyer:</strong> You can reach out to ${sanitizedBuyerName} directly at <strong>${sanitizedBuyerPhone}</strong> to answer their questions and discuss the product further.
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/product/${createSlug(listingName)}/${sanitizedProductId}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">
                    View Your Listing
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Please respond to the buyer promptly to answer their questions. Quick responses increase your chances of making a sale!
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your seller dashboard or contact our support team at <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep selling on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 700; font-size: 14px;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};