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

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * EmailService - Sends professional HTML transactional emails to customers
 * Supports Brevo HTTP API, Resend HTTP API, and standard Spring Boot JavaMail (SMTP).
 * HTTP APIs use port 443 (HTTPS), which works seamlessly on Render Free Tier and campus Wi-Fi.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Value("${app.mail.from:Lankan Vibe <no-reply@lankanvibe.com>}")
    private String mailFrom;

    @Value("${app.mail.enabled:true}")
    private boolean mailEnabled;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    // Brevo (Sendinblue) API settings (uses HTTPS port 443)
    @Value("${app.mail.brevo-api-key:${BREVO_API_KEY:}}")
    private String brevoApiKey;

    @Value("${app.mail.brevo-sender-email:${BREVO_SENDER_EMAIL:}}")
    private String brevoSenderEmail;

    @Value("${app.mail.brevo-sender-name:${BREVO_SENDER_NAME:Lankan Vibe}}")
    private String brevoSenderName;

    // Resend API settings (uses HTTPS port 443)
    @Value("${app.mail.resend-api-key:${RESEND_API_KEY:}}")
    private String resendApiKey;

    @Value("${app.mail.resend-from:${RESEND_FROM:Lankan Vibe <onboarding@resend.dev>}}")
    private String resendFrom;

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

        String customerName = order.getCustomerName() != null && !order.getCustomerName().trim().isEmpty()
                ? order.getCustomerName().trim()
                : "Valued Customer";

        String subject = "Order Confirmed! Receipt for Order #" + order.getId() + " - Lankan Vibe";
        String htmlBody = buildOrderConfirmationHtml(order, paymentMethod);

        log.info("Sending order confirmation email to '{}' for Order #{}...", recipientEmail, order.getId());
        boolean sent = sendHtmlEmail(recipientEmail, customerName, subject, htmlBody);
        if (sent) {
            log.info("Order confirmation email successfully sent to '{}' for Order #{}", recipientEmail, order.getId());
        } else {
            log.warn("Failed to send order confirmation email to '{}' for Order #{}", recipientEmail, order.getId());
        }
    }

    /**
     * Helper to test email connection directly
     */
    public boolean testSendEmail(String testRecipient) {
        String testSubject = "Lankan Vibe - Email Service Verification";
        String testHtml = "<div style=\"font-family: Arial, sans-serif; padding: 20px; color: #333;\">"
                + "<h2 style=\"color: #10b981;\">&#10004; Lankan Vibe Email Service Working!</h2>"
                + "<p>This is a test email verifying that your Lankan Vibe email configuration is functioning properly!</p>"
                + "<p style=\"font-size: 13px; color: #666;\">Sent from Lankan Vibe Clothing Backend.</p>"
                + "</div>";

        return sendHtmlEmail(testRecipient, "Test Recipient", testSubject, testHtml);
    }

    /**
     * Universal method to send HTML emails:
     * 1. If BREVO_API_KEY is configured -> uses Brevo HTTP REST API (port 443)
     * 2. Else if RESEND_API_KEY is configured -> uses Resend HTTP REST API (port 443)
     * 3. Else -> falls back to standard Spring JavaMailSender (SMTP port 587)
     */
    public boolean sendHtmlEmail(String toEmail, String toName, String subject, String htmlBody) {
        if (!mailEnabled) {
            log.info("Email service disabled via app.mail.enabled=false. Skipped email to {}", toEmail);
            return false;
        }

        if (brevoApiKey != null && !brevoApiKey.trim().isEmpty()) {
            return sendViaBrevoApi(toEmail, toName, subject, htmlBody);
        } else if (resendApiKey != null && !resendApiKey.trim().isEmpty()) {
            return sendViaResendApi(toEmail, subject, htmlBody);
        } else {
            return sendViaSmtp(toEmail, subject, htmlBody);
        }
    }

    /**
     * Sends email via Brevo (Sendinblue) HTTP API over HTTPS (Port 443).
     * Works 100% on Render Free Tier and campus Wi-Fi networks.
     */
    private boolean sendViaBrevoApi(String toEmail, String toName, String subject, String htmlBody) {
        try {
            log.info("Dispatching email to '{}' via Brevo HTTP API...", toEmail);

            String senderEmail = (brevoSenderEmail != null && !brevoSenderEmail.trim().isEmpty())
                    ? brevoSenderEmail.trim()
                    : (mailUsername != null && !mailUsername.trim().isEmpty() ? mailUsername.trim() : "thehufes@gmail.com");

            String recipientJson = "{\"email\":" + quote(toEmail.trim())
                    + (toName != null && !toName.trim().isEmpty() ? ",\"name\":" + quote(toName.trim()) : "") + "}";

            String requestBody = "{"
                    + "\"sender\":{\"name\":" + quote(brevoSenderName) + ",\"email\":" + quote(senderEmail) + "},"
                    + "\"to\":[" + recipientJson + "],"
                    + "\"subject\":" + quote(subject) + ","
                    + "\"htmlContent\":" + quote(htmlBody)
                    + "}";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.brevo.com/v3/smtp/email"))
                    .header("api-key", brevoApiKey.trim())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                    .timeout(Duration.ofSeconds(15))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                log.info("Email successfully sent via Brevo HTTP API to '{}' (HTTP {})", toEmail, response.statusCode());
                return true;
            } else {
                log.error("Brevo HTTP API failed for '{}': HTTP {} - {}", toEmail, response.statusCode(), response.body());
                return false;
            }
        } catch (Exception e) {
            log.error("Exception calling Brevo HTTP API for '{}': {}", toEmail, e.getMessage(), e);
            return false;
        }
    }

    /**
     * Sends email via Resend HTTP API over HTTPS (Port 443).
     * Works 100% on Render Free Tier and campus Wi-Fi networks.
     */
    private boolean sendViaResendApi(String toEmail, String subject, String htmlBody) {
        try {
            log.info("Dispatching email to '{}' via Resend HTTP API...", toEmail);

            String requestBody = "{"
                    + "\"from\":" + quote(resendFrom) + ","
                    + "\"to\":[" + quote(toEmail.trim()) + "],"
                    + "\"subject\":" + quote(subject) + ","
                    + "\"html\":" + quote(htmlBody)
                    + "}";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.resend.com/emails"))
                    .header("Authorization", "Bearer " + resendApiKey.trim())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                    .timeout(Duration.ofSeconds(15))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                log.info("Email successfully sent via Resend HTTP API to '{}' (HTTP {})", toEmail, response.statusCode());
                return true;
            } else {
                log.error("Resend HTTP API failed for '{}': HTTP {} - {}", toEmail, response.statusCode(), response.body());
                return false;
            }
        } catch (Exception e) {
            log.error("Exception calling Resend HTTP API for '{}': {}", toEmail, e.getMessage(), e);
            return false;
        }
    }

    /**
     * Helper to safely escape and quote strings into JSON format
     */
    private static String quote(String string) {
        if (string == null) {
            return "\"\"";
        }
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < string.length(); i++) {
            char c = string.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < ' ') {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append("\"");
        return sb.toString();
    }

    /**
     * Fallback: Sends email using standard Spring Boot JavaMailSender (SMTP).
     */
    private boolean sendViaSmtp(String toEmail, String subject, String htmlBody) {
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            log.warn("JavaMailSender bean is not available. Please check mail configuration.");
            return false;
        }

        if (mailUsername == null || mailUsername.trim().isEmpty()) {
            log.warn("Email to '{}' was not sent because neither BREVO_API_KEY, RESEND_API_KEY, nor MAIL_USERNAME is set in .env.", toEmail);
            return false;
        }

        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(toEmail.trim());
            helper.setSubject(subject);
            helper.setText(htmlBody, true);

            log.info("Sending email via SMTP to '{}'...", toEmail);
            mailSender.send(mimeMessage);
            log.info("Email successfully sent via SMTP to '{}'", toEmail);
            return true;
        } catch (Exception e) {
            log.error("SMTP error sending email to '{}': {}", toEmail, e.getMessage(), e);
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
