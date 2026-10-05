package com.lankanvibe.backend.service;

import com.lankanvibe.backend.dto.OrderDto;
import com.lankanvibe.backend.dto.OrderItemDto;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * EmailService - Sends professional HTML transactional emails to customers
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final ObjectProvider<JavaMailSender> mailSenderProvider;

    @Value("${app.mail.from:Lankan Vibe <no-reply@lankanvibe.com>}")
    private String mailFrom;

    @Value("${app.mail.enabled:true}")
    private boolean mailEnabled;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    public EmailService(ObjectProvider<JavaMailSender> mailSenderProvider) {
        this.mailSenderProvider = mailSenderProvider;
    }

    /**
     * Send order confirmation email asynchronously to the customer who placed the order.
     * Uses OrderDto so no Hibernate LazyInitializationException occurs across threads.
     */
    @Async
    public void sendOrderConfirmationEmail(OrderDto order, String paymentMethod) {
        if (!mailEnabled) {
            log.info("Email service disabled via app.mail.enabled=false. Skipped email for order #{}", order.getId());
            return;
        }

        String recipientEmail = order.getUserEmail();
        if (recipientEmail == null || recipientEmail.trim().isEmpty() || !recipientEmail.contains("@")) {
            log.warn("Cannot send order confirmation email: Order #{} has invalid recipient email '{}'",
                    order.getId(), recipientEmail);
            return;
        }

        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            log.warn("JavaMailSender bean is not available. Please check spring-boot-starter-mail configuration.");
            return;
        }

        if (mailUsername == null || mailUsername.trim().isEmpty()) {
            log.warn("Order #{} placed successfully! Confirmation email to '{}' was not sent because MAIL_USERNAME is not set in backend/.env. Add your Gmail/SMTP credentials to send live emails.",
                    order.getId(), recipientEmail);
            return;
        }

        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

            helper.setFrom(mailFrom);
            helper.setTo(recipientEmail.trim());
            helper.setSubject("Order Confirmed! Receipt for Order #" + order.getId() + " - Lankan Vibe");

            String htmlBody = buildOrderConfirmationHtml(order, paymentMethod);
            helper.setText(htmlBody, true);

            log.info("Sending order confirmation email to '{}' for Order #{}...", recipientEmail, order.getId());
            mailSender.send(mimeMessage);
            log.info("Order confirmation email successfully sent to '{}' for Order #{}", recipientEmail, order.getId());

        } catch (MessagingException e) {
            log.error("Failed to construct or send email for Order #{}: {}", order.getId(), e.getMessage(), e);
        } catch (Exception e) {
            log.error("Unexpected error sending email to '{}' for Order #{}: {}", recipientEmail, order.getId(), e.getMessage(), e);
        }
    }

    /**
     * Helper to test SMTP connection directly
     */
    public boolean testSendEmail(String testRecipient) {
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            log.warn("JavaMailSender is not available");
            return false;
        }
        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, false, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(testRecipient);
            helper.setSubject("Lankan Vibe - SMTP Test Email");
            helper.setText("This is a test email verifying that your Lankan Vibe email service is working properly!", false);
            mailSender.send(mimeMessage);
            log.info("Test email successfully sent to {}", testRecipient);
            return true;
        } catch (Exception e) {
            log.error("SMTP test failed for {}: {}", testRecipient, e.getMessage(), e);
            return false;
        }
    }

    /**
     * Builds responsive, modern, branded HTML receipt email
     */
    private String buildOrderConfirmationHtml(OrderDto order, String paymentMethod) {
        DecimalFormat df = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.US));
        String formattedTotal = order.getTotalAmount() != null ? df.format(order.getTotalAmount()) : "0.00";

        String customerName = order.getCustomerName() != null && !order.getCustomerName().trim().isEmpty()
                ? order.getCustomerName().trim()
                : "Valued Customer";

        String orderDateStr = order.getOrderDate() != null
                ? order.getOrderDate().format(DateTimeFormatter.ofPattern("MMM dd, yyyy - hh:mm a"))
                : "Just now";

        String cleanPayment = paymentMethod != null && !paymentMethod.trim().isEmpty()
                ? paymentMethod.replace("_", " ")
                : "Cash on Delivery (COD)";

        String shippingAddress = order.getShippingAddress() != null && !order.getShippingAddress().trim().isEmpty()
                ? order.getShippingAddress().trim()
                : "Address provided at checkout";

        // Build item rows
        StringBuilder itemsHtml = new StringBuilder();
        if (order.getItems() != null && !order.getItems().isEmpty()) {
            for (OrderItemDto item : order.getItems()) {
                String lineTotal = item.getTotalPrice() != null ? df.format(item.getTotalPrice()) : "0.00";
                String unitPrice = item.getUnitPrice() != null ? df.format(item.getUnitPrice()) : "0.00";

                itemsHtml.append("""
                    <tr>
                      <td style="padding: 12px 10px; border-bottom: 1px solid #f0f0f0; text-align: left; vertical-align: middle;">
                        <span style="font-weight: 700; color: #1f2937; font-size: 13px; display: block;">%s</span>
                        <span style="font-size: 11px; color: #9ca3af; text-transform: uppercase;">Standard Edition</span>
                      </td>
                      <td style="padding: 12px 10px; border-bottom: 1px solid #f0f0f0; text-align: center; color: #4b5563; font-size: 13px; vertical-align: middle;">
                        %d
                      </td>
                      <td style="padding: 12px 10px; border-bottom: 1px solid #f0f0f0; text-align: right; color: #4b5563; font-size: 13px; vertical-align: middle;">
                        Rs. %s
                      </td>
                      <td style="padding: 12px 10px; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: 700; color: #111827; font-size: 13px; vertical-align: middle;">
                        Rs. %s
                      </td>
                    </tr>
                    """.formatted(
                        escapeHtml(item.getProductName()),
                        item.getQuantity() != null ? item.getQuantity() : 1,
                        unitPrice,
                        lineTotal
                ));
            }
        } else {
            itemsHtml.append("""
                <tr>
                  <td colspan="4" style="padding: 16px; text-align: center; color: #6b7280; font-size: 13px;">
                    Handcrafted Lankan Vibe Apparel Item(s)
                  </td>
                </tr>
                """);
        }

        return """
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Order Confirmation #%d</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1f2937;">
              <table role="presentation" width="100%%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 30px 10px;">
                <tr>
                  <td align="center">
                    
                    <!-- Main Card -->
                    <table role="presentation" width="100%%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06); border: 1px solid #e5e7eb;">
                      
                      <!-- Brand Header -->
                      <tr>
                        <td style="background-color: #111111; padding: 32px 24px; text-align: center; border-bottom: 3px solid #c58b10;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 3px; font-weight: 900; text-transform: uppercase;">
                            LANKAN VIBE
                          </h1>
                          <p style="margin: 5px 0 0; color: #c58b10; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">
                            Authentic Sri Lankan Apparel & Streetwear
                          </p>
                        </td>
                      </tr>
                      
                      <!-- Confirmation Banner -->
                      <tr>
                        <td style="padding: 30px 30px 15px; text-align: center;">
                          <div style="display: inline-block; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 50px; padding: 6px 18px; margin-bottom: 12px;">
                            <span style="color: #047857; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                              ✓ Order Confirmed
                            </span>
                          </div>
                          <h2 style="margin: 0 0 8px; color: #111827; font-size: 22px; font-weight: 800;">
                            Thank You for Your Order!
                          </h2>
                          <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
                            Ayubowan, <strong>%s</strong>! We have received your order and are currently preparing it for delivery.
                          </p>
                        </td>
                      </tr>
                      
                      <!-- Order Summary Card -->
                      <tr>
                        <td style="padding: 15px 30px;">
                          <table role="presentation" width="100%%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fafafa; border-radius: 8px; border: 1px solid #e5e7eb; padding: 16px;">
                            <tr>
                              <td style="padding: 6px 10px; font-size: 12px; color: #6b7280; width: 40%%;">Order ID:</td>
                              <td style="padding: 6px 10px; font-size: 13px; font-weight: 700; color: #111827; width: 60%%;">#LV-%d</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 10px; font-size: 12px; color: #6b7280;">Order Date:</td>
                              <td style="padding: 6px 10px; font-size: 13px; font-weight: 600; color: #111827;">%s</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 10px; font-size: 12px; color: #6b7280;">Payment Method:</td>
                              <td style="padding: 6px 10px; font-size: 13px; font-weight: 600; color: #111827;">%s</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 10px; font-size: 12px; color: #6b7280; vertical-align: top;">Shipping To:</td>
                              <td style="padding: 6px 10px; font-size: 13px; font-weight: 600; color: #111827;">%s</td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Line Items Table -->
                      <tr>
                        <td style="padding: 15px 30px;">
                          <table role="presentation" width="100%%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                            <thead>
                              <tr style="border-bottom: 2px solid #e5e7eb;">
                                <th style="padding: 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">Item</th>
                                <th style="padding: 10px; text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">Qty</th>
                                <th style="padding: 10px; text-align: right; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">Price</th>
                                <th style="padding: 10px; text-align: right; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              %s
                            </tbody>
                          </table>
                        </td>
                      </tr>

                      <!-- Total Box -->
                      <tr>
                        <td style="padding: 10px 30px 25px;">
                          <table role="presentation" width="100%%" border="0" cellspacing="0" cellpadding="0" style="border-top: 2px solid #e5e7eb; padding-top: 15px;">
                            <tr>
                              <td style="font-size: 15px; font-weight: 800; color: #111827; text-transform: uppercase;">
                                Total Amount
                              </td>
                              <td style="text-align: right; font-size: 20px; font-weight: 800; color: #c58b10;">
                                Rs. %s
                              </td>
                            </tr>
                            <tr>
                              <td colspan="2" style="font-size: 11px; color: #6b7280; padding-top: 6px;">
                                * All local taxes and shipping handling included.
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Delivery Notice Box -->
                      <tr>
                        <td style="padding: 0 30px 25px;">
                          <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; text-align: left;">
                            <p style="margin: 0; font-size: 12px; color: #92400e; line-height: 1.5;">
                              <strong>📦 Delivery Notice:</strong> Standard delivery across Sri Lanka takes 2-4 business days. Our delivery rider will call your phone prior to dispatching your parcel.
                            </p>
                          </div>
                        </td>
                      </tr>

                      <!-- Footer -->
                      <tr>
                        <td style="background-color: #1f2937; padding: 24px 30px; text-align: center; color: #9ca3af; font-size: 12px; line-height: 1.6;">
                          <p style="margin: 0 0 6px; color: #d1d5db; font-weight: 600;">
                            Need help with your order?
                          </p>
                          <p style="margin: 0 0 14px;">
                            Reply directly to this email or WhatsApp us at <strong>+94 77 123 4567</strong>
                          </p>
                          <p style="margin: 0; font-size: 11px; color: #6b7280;">
                            &copy; 2026 Lankan Vibe Clothing. 123 Galle Road, Colombo, Sri Lanka.<br>
                            Thank you for celebrating Sri Lankan style with us!
                          </p>
                        </td>
                      </tr>

                    </table>
                    
                  </td>
                </tr>
              </table>
            </body>
            </html>
            """.formatted(
                order.getId(),
                escapeHtml(customerName),
                order.getId(),
                orderDateStr,
                escapeHtml(cleanPayment),
                escapeHtml(shippingAddress),
                itemsHtml.toString(),
                formattedTotal
        );
    }

    private String escapeHtml(String input) {
        if (input == null) return "";
        return input.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace("\"", "&quot;")
                    .replace("'", "&#39;");
    }
}
