package com.lankanvibe.backend.controller;

import com.lankanvibe.backend.dto.CreateOrderRequest;
import com.lankanvibe.backend.dto.OrderDto;
import com.lankanvibe.backend.dto.UpdateOrderStatusRequest;
import com.lankanvibe.backend.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * OrderController - REST API endpoints for customer orders and admin order tracking
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class OrderController {

    private final OrderService orderService;
    private final com.lankanvibe.backend.service.EmailService emailService;

    public OrderController(OrderService orderService, com.lankanvibe.backend.service.EmailService emailService) {
        this.orderService = orderService;
        this.emailService = emailService;
    }

    // POST /api/orders - Place a new order (supports both logged-in and guest customers)
    @PostMapping("/orders")
    public ResponseEntity<OrderDto> createOrder(@AuthenticationPrincipal UserDetails userDetails,
                                                @Valid @RequestBody CreateOrderRequest request) {
        String userEmail = userDetails != null ? userDetails.getUsername() : null;
        OrderDto created = orderService.createOrder(userEmail, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    // POST /api/orders/test-email - Test SMTP configuration
    @PostMapping("/orders/test-email")
    public ResponseEntity<String> testEmail(@RequestParam String to) {
        boolean sent = emailService.testSendEmail(to);
        if (sent) {
            return ResponseEntity.ok("Test email successfully sent to " + to);
        } else {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to send test email. Please check server logs and MAIL_USERNAME / MAIL_PASSWORD settings in backend/.env.");
        }
    }

    // GET /api/orders/my - Get authenticated user's order history
    @GetMapping("/orders/my")
    public ResponseEntity<List<OrderDto>> getMyOrders(@AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(orderService.getMyOrders(userDetails.getUsername()));
    }

    // GET /api/orders/{id} - Get order details by ID
    @GetMapping("/orders/{id}")
    public ResponseEntity<OrderDto> getOrderById(@AuthenticationPrincipal UserDetails userDetails,
                                                 @PathVariable Long id) {
        return ResponseEntity.ok(orderService.getOrderById(userDetails.getUsername(), id));
    }

    // GET /api/admin/orders - Admin: view all customer orders
    @GetMapping("/admin/orders")
    public ResponseEntity<List<OrderDto>> getAllOrders() {
        return ResponseEntity.ok(orderService.getAllOrders());
    }

    // PUT /api/admin/orders/{id}/status - Admin: update order status
    @PutMapping("/admin/orders/{id}/status")
    public ResponseEntity<OrderDto> updateOrderStatus(@PathVariable Long id,
                                                      @Valid @RequestBody UpdateOrderStatusRequest request) {
        return ResponseEntity.ok(orderService.updateOrderStatus(id, request.getStatus()));
    }
}
