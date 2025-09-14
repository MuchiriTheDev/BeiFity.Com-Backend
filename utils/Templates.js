// templates.js
import sanitizeHtml from 'sanitize-html';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';

// Custom sanitize-html configuration to preserve URLs
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

// HTML Email Template Function for Buyer (unchanged)
export const generateOrderEmailBuyer = (buyerName, items, orderTime, totalPrice, deliveryAddress, orderId, sellerIds, paymentUrl) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName, sanitizeConfig);
  const sanitizedOrderTime = sanitizeHtml(orderTime, sanitizeConfig);
  const sanitizedCounty = sanitizeHtml(deliveryAddress.county || '', sanitizeConfig);
  const sanitizedNearestTown = sanitizeHtml(deliveryAddress.nearestTown || '', sanitizeConfig);
  const sanitizedCountry = sanitizeHtml(deliveryAddress.country || 'Kenya', sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedPaymentUrl = sanitizeHtml(paymentUrl, { ...sanitizeConfig, allowedSchemes: ['https'] });

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
                    Hi ${sanitizedBuyerName}, we’re thrilled to confirm your order on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. Please complete the payment to proceed.
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
                  <a href="${sanitizedPaymentUrl}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Complete Payment</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Click the button above to complete your payment. Once confirmed, the seller(s) will contact you via chat to arrange shipping. Please verify the product before finalizing delivery.
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
                    A new order has been placed on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. The buyer is completing payment. Funds will be held until delivery confirmation.
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

// HTML Email Template Function for Order Status Update (unchanged)
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

// HTML Email Template Function for Order Cancellation (unchanged)
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

// New HTML Email Template Function for Refund Notification (Buyer and Seller)
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
    ? `A ${isFullRefund ? 'full' : 'partial'} refund of <strong>KES ${sanitizedRefundAmount}</strong> for the item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}) has been initiated and will be processed to your original payment method within 5-10 business days.`
    : `The item "<strong>${sanitizedItemName}</strong>" (Order ID: ${sanitizedOrderId}) has been cancelled by the buyer. An amount of <strong>KES ${sanitizedRefundAmount}</strong> has been deducted from your pending balance as part of the ${isFullRefund ? 'full' : 'partial'} refund process.`;

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

// HTML Email Template Function for Payout Notification (Seller)
export const generatePayoutNotificationEmail = (sellerName, orderId, payoutAmount, itemIds, paystackTransferCode) => {
  const sanitizedSellerName = sanitizeHtml(sellerName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedPayoutAmount = sanitizeHtml(payoutAmount.toFixed(2), sanitizeConfig);
  const sanitizedPaystackTransferCode = sanitizeHtml(paystackTransferCode || 'N/A', sanitizeConfig);
  const sanitizedItemIds = itemIds.map(id => sanitizeHtml(id, sanitizeConfig)).join(', ');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payout Initiated - BeiFity.Com</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Payout Initiated, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Payout Has Been Initiated</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName},<br>
                    A payout of <strong>KES ${sanitizedPayoutAmount}</strong> for items (Item IDs: ${sanitizedItemIds}) in Order ID: ${sanitizedOrderId} has been initiated to your M-Pesa account. The funds should reflect within 1-3 business days.<br>
                    Transaction Reference: <strong>${sanitizedPaystackTransferCode}</strong>
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

// HTML Email Template Function for Transaction Reversal Notification (Buyer and Seller)
export const generateTransactionReversalEmail = (recipientName, orderId, itemIds, recipientRole, chatUserId) => {
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);
  const sanitizedOrderId = sanitizeHtml(orderId, sanitizeConfig);
  const sanitizedItemIds = itemIds.map(id => sanitizeHtml(id, sanitizeConfig)).join(', ');
  const sanitizedRecipientRole = sanitizeHtml(recipientRole, sanitizeConfig);
  const sanitizedChatUserId = sanitizeHtml(chatUserId, sanitizeConfig);

  const isBuyer = sanitizedRecipientRole.toLowerCase() === 'buyer';
  const title = isBuyer ? 'Transaction Reversed - Full Refund' : 'Transaction Reversed Notification';
  const message = isBuyer
    ? `The transaction for Order ID: ${sanitizedOrderId} (Items: ${sanitizedItemIds}) has been reversed. A full refund has been processed to your original payment method and should reflect within 5-10 business days.`
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

// HTML Email Template Function for Admin Order Cancellation Notification
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
  const sanitizedRecipientName = sanitizeHtml(recipientName, sanitizeConfig);

  const productCards = products
    .map((product) => {
      const sanitizedProductName = sanitizeHtml(product.name, sanitizeConfig);
      const sanitizedPrice = sanitizeHtml(product.price.toFixed(2), sanitizeConfig);
      const sanitizedDescription = sanitizeHtml(product.description.slice(0, 100) + (product.description.length > 100 ? '...' : ''), sanitizeConfig);
      const sanitizedImage = sanitizeHtml(product.image || 'https://via.placeholder.com/150', sanitizeConfig);
      const sanitizedProductUrl = sanitizeHtml(product.url, { ...sanitizeConfig, allowedSchemes: ['https'] });

      return `
        <tr>
          <td style="padding: 15px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f4f8; border-radius: 8px;">
              <tr>
                <td style="width: 150px; padding: 10px;">
                  <img src="${sanitizedImage}" alt="${sanitizedProductName}" style="width: 100%; height: auto; border-radius: 4px;">
                </td>
                <td style="padding: 10px; text-align: left;">
                  <h3 style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0 0 5px;">${sanitizedProductName}</h3>
                  <p style="font-size: 14px; color: #e91e63; margin: 0 0 5px;">KES ${sanitizedPrice}</p>
                  <p style="font-size: 13px; color: #475569; margin: 0 0 10px;">${sanitizedDescription}</p>
                  <a href="${sanitizedProductUrl}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Shop Now</a>
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
      <title>Discover Amazing Deals on BeiFity.Com!</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
              <!-- Header -->
              <tr>
                <td style="background-color: #f4f7ffff; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; display: block; margin: 0 auto;">
                  <h1 style="font-size: 22px; font-weight: 700; color: #ffffff; margin: 15px 0 0;">Hello ${sanitizedRecipientName}, Discover Top Picks!</h1>
                </td>
              </tr>
              <!-- Hero Section -->
              <tr>
                <td style="padding: 20px; text-align: center;">
                  <p style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0 0 15px;">Explore the latest deals on <span style="color: #1e40af;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>!</p>
                  <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px;">We've handpicked these amazing products just for you. Don't miss out!</p>
                </td>
              </tr>
              <!-- Products -->
              <tr>
                <td>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    ${productCards}
                  </table>
                </td>
              </tr>
              <!-- CTA -->
              <tr>
                <td style="padding: 20px; text-align: center;">
                  <a href="${FRONTEND_URL}/collection" style="display: inline-block; background-color: #fbbf24; color: #1e293b; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px;">Browse All Products</a>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding: 20px; text-align: center; background-color: #f0f4f8; border-radius: 0 0 12px 12px;">
                  <p style="font-size: 13px; color: #64748b; margin: 0 0 10px;">
                    Don't want these emails? <a href="${FRONTEND_URL}/unsubscribe" style="color: #1e40af; text-decoration: underline;">Unsubscribe</a>
                  </p>
                  <p style="font-size: 13px; color: #64748b; margin: 0;">
                    BeiFity.Com | Nairobi, Kenya | <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>
                  </p>
                  <p style="font-size: 13px; color: #64748b; margin: 10px 0 0;">
                    <span style="color: #1e40af; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
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

  const productDetails = products
    .map((product) => {
      const sanitizedProductName = sanitizeHtml(product.name, sanitizeConfig);
      const sanitizedPrice = sanitizeHtml(product.price.toFixed(2), sanitizeConfig);
      const sanitizedDescription = sanitizeHtml(product.description.slice(0, 100) + (product.description.length > 100 ? '...' : ''), sanitizeConfig);
      const sanitizedImage = sanitizeHtml(product.image || 'https://via.placeholder.com/150', sanitizeConfig);
      const sanitizedProductUrl = sanitizeHtml(product.url, { ...sanitizeConfig, allowedSchemes: ['https'] });

      return `
        <tr>
          <td style="padding: 15px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f4f8; border-radius: 8px;">
              <tr>
                <td style="width: 150px; padding: 10px;">
                  <img src="${sanitizedImage}" alt="${sanitizedProductName}" style="width: 100%; height: auto; border-radius: 4px;">
                </td>
                <td style="padding: 10px; text-align: left;">
                  <h3 style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0 0 5px;">${sanitizedProductName}</h3>
                  <p style="font-size: 14px; color: #e91e63; margin: 0 0 5px;">KES ${sanitizedPrice}</p>
                  <p style="font-size: 13px; color: #475569; margin: 0 0 10px;">${sanitizedDescription}</p>
                  <a href="${sanitizedProductUrl}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Product</a>
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
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
              <!-- Header -->
              <tr>
                <td style="background-color: #1e40af; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
                  <img src="https://www.beifity.com/assets/logo-without-CMu8rsBL.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; display: block; margin: 0 auto;">
                  <h1 style="font-size: 22px; font-weight: 700; color: #ffffff; margin: 15px 0 0;">Marketing Campaign Report</h1>
                </td>
              </tr>
              <!-- Summary -->
              <tr>
                <td style="padding: 20px; text-align: center;">
                  <p style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0 0 15px;">Marketing Email Summary</p>
                  <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px;">
                    A marketing email campaign was sent to ${recipients.length} users on ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}.
                    Below are the promoted products and recipients.
                  </p>
                </td>
              </tr>
              <!-- Recipients -->
              <tr>
                <td style="padding: 0 20px 20px; text-align: left;">
                  <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0 0 10px;">Recipients:</p>
                  <p style="font-size: 13px; color: #475569; margin: 0;">${sanitizedRecipients}</p>
                </td>
              </tr>
              <!-- Products -->
              <tr>
                <td>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding: 0 20px 20px; text-align: left;">
                        <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0 0 10px;">Promoted Products:</p>
                      </td>
                    </tr>
                    ${productDetails}
                  </table>
                </td>
              </tr>
              <!-- CTA -->
              <tr>
                <td style="padding: 20px; text-align: center;">
                  <a href="${FRONTEND_URL}/admin/dashboard" style="display: inline-block; background-color: #fbbf24; color: #1e293b; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px;">View Admin Dashboard</a>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding: 20px; text-align: center; background-color: #f0f4f8; border-radius: 0 0 12px 12px;">
                  <p style="font-size: 13px; color: #64748b; margin: 0;">
                    BeiFity.Com | Nairobi, Kenya | <a href="mailto:customer.care@beifity.com" style="color: #1e40af; text-decoration: underline;">customer.care@beifity.com</a>
                  </p>
                  <p style="font-size: 13px; color: #64748b; margin: 10px 0 0;">
                    <span style="color: #1e40af; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
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