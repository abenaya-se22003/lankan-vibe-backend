package com.lankanvibe.backend.service;

import com.lankanvibe.backend.dto.CreateOrderRequest;
import com.lankanvibe.backend.dto.OrderDto;
import com.lankanvibe.backend.dto.OrderItemDto;
import com.lankanvibe.backend.dto.OrderItemRequest;
import com.lankanvibe.backend.model.*;
import com.lankanvibe.backend.repository.CartRepository;
import com.lankanvibe.backend.repository.OrderRepository;
import com.lankanvibe.backend.repository.ProductRepository;
import com.lankanvibe.backend.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * OrderService - Business logic for customer orders, confirmation emails, and admin tracking
 */
@Service
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final CartRepository cartRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final EmailService emailService;
    private final PasswordEncoder passwordEncoder;

    public OrderService(OrderRepository orderRepository,
                        CartRepository cartRepository,
                        UserRepository userRepository,
                        ProductRepository productRepository,
                        EmailService emailService,
                        PasswordEncoder passwordEncoder) {
        this.orderRepository = orderRepository;
        this.cartRepository = cartRepository;
        this.userRepository = userRepository;
        this.productRepository = productRepository;
        this.emailService = emailService;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Create an order from authenticated user's cart or guest checkout payload,
     * and automatically trigger the order confirmation email.
     */
    public OrderDto createOrder(String userEmail, CreateOrderRequest request) {
        User user;

        if (userEmail != null && !userEmail.trim().isEmpty()) {
            user = getUser(userEmail);
        } else if (request.getEmail() != null && !request.getEmail().trim().isEmpty()) {
            String guestEmail = request.getEmail().trim().toLowerCase();
            user = userRepository.findByEmail(guestEmail).orElseGet(() -> {
                User u = new User();
                u.setEmail(guestEmail);
                String fullName = request.getCustomerName() != null && !request.getCustomerName().trim().isEmpty()
                        ? request.getCustomerName().trim()
                        : "Valued Customer";
                String[] parts = fullName.split("\\s+", 2);
                u.setFirstName(parts[0]);
                u.setLastName(parts.length > 1 ? parts[1] : "");
                u.setRole(User.Role.CUSTOMER);
                u.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
                return userRepository.save(u);
            });
        } else {
            throw new IllegalArgumentException("User email or contact email is required to place an order");
        }

        // Try getting cart from DB first (for logged-in user with DB cart)
        Cart cart = cartRepository.findByUserId(user.getId()).orElse(null);

        Order order = new Order();
        order.setUser(user);
        order.setShippingAddress(request.getShippingAddress());
        order.setStatus(Order.Status.PENDING);

        List<OrderItem> orderItems = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;

        if (cart != null && !cart.getItems().isEmpty()) {
            for (CartItem cartItem : cart.getItems()) {
                OrderItem orderItem = new OrderItem();
                orderItem.setOrder(order);
                orderItem.setProduct(cartItem.getProduct());
                orderItem.setQuantity(cartItem.getQuantity());
                orderItem.setUnitPrice(cartItem.getProduct().getPrice());

                BigDecimal lineTotal = cartItem.getProduct().getPrice()
                        .multiply(BigDecimal.valueOf(cartItem.getQuantity()));
                orderItem.setTotalPrice(lineTotal);

                orderItems.add(orderItem);
                total = total.add(lineTotal);
            }

            // Clear database cart after order creation
            cart.getItems().clear();
            cartRepository.save(cart);

        } else if (request.getItems() != null && !request.getItems().isEmpty()) {
            // Guest or explicit items from checkout payload
            for (OrderItemRequest itemReq : request.getItems()) {
                OrderItem orderItem = new OrderItem();
                orderItem.setOrder(order);

                Product product = null;
                if (itemReq.getProductId() != null) {
                    product = productRepository.findById(itemReq.getProductId()).orElse(null);
                }
                if (product == null) {
                    product = productRepository.findAll().stream().findFirst()
                            .orElseThrow(() -> new IllegalStateException("No products available to fulfill order"));
                }

                orderItem.setProduct(product);
                int qty = itemReq.getQuantity() != null && itemReq.getQuantity() > 0 ? itemReq.getQuantity() : 1;
                orderItem.setQuantity(qty);

                BigDecimal unitPrice = itemReq.getUnitPrice() != null ? itemReq.getUnitPrice() : product.getPrice();
                orderItem.setUnitPrice(unitPrice);

                BigDecimal lineTotal = unitPrice.multiply(BigDecimal.valueOf(qty));
                orderItem.setTotalPrice(lineTotal);

                orderItems.add(orderItem);
                total = total.add(lineTotal);
            }
        } else {
            throw new IllegalStateException("Cannot place an order with an empty cart");
        }

        order.setTotalAmount(total);
        order.setOrderItems(orderItems);

        Order saved = orderRepository.save(order);
        OrderDto orderDto = mapToOrderDto(saved);

        // Send order confirmation email asynchronously
        String payment = request.getPaymentMethod() != null ? request.getPaymentMethod() : "COD";
        emailService.sendOrderConfirmationEmail(orderDto, payment);

        return orderDto;
    }

    // Place an order from the user's current cart (backward compatibility)
    public OrderDto createOrderFromCart(String userEmail, CreateOrderRequest request) {
        return createOrder(userEmail, request);
    }

    // Customer: Get my orders
    @Transactional(readOnly = true)
    public List<OrderDto> getMyOrders(String userEmail) {
        User user = getUser(userEmail);
        return orderRepository.findByUserId(user.getId())
                .stream()
                .map(this::mapToOrderDto)
                .toList();
    }

    // Customer / Admin: Get order details by ID
    @Transactional(readOnly = true)
    public OrderDto getOrderById(String userEmail, Long orderId) {
        User user = getUser(userEmail);
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Order not found with ID: " + orderId));

        if (!order.getUser().getId().equals(user.getId()) && user.getRole() != User.Role.ADMIN) {
            throw new org.springframework.security.access.AccessDeniedException("Not authorized to view this order");
        }

        return mapToOrderDto(order);
    }

    // Admin: Get all orders
    @Transactional(readOnly = true)
    public List<OrderDto> getAllOrders() {
        return orderRepository.findAll()
                .stream()
                .map(this::mapToOrderDto)
                .toList();
    }

    // Admin: Update order status
    public OrderDto updateOrderStatus(Long orderId, Order.Status status) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Order not found with ID: " + orderId));
        order.setStatus(status);
        return mapToOrderDto(orderRepository.save(order));
    }

    private User getUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User not found with email: " + email));
    }

    public OrderDto mapToOrderDto(Order order) {
        OrderDto dto = new OrderDto();
        dto.setId(order.getId());
        dto.setUserId(order.getUser().getId());
        dto.setUserEmail(order.getUser().getEmail());
        dto.setCustomerName(order.getUser().getFirstName() + " " + order.getUser().getLastName());
        dto.setTotalAmount(order.getTotalAmount());
        dto.setStatus(order.getStatus().name());
        dto.setShippingAddress(order.getShippingAddress());
        dto.setOrderDate(order.getOrderDate());

        List<OrderItemDto> itemDtos = new ArrayList<>();
        if (order.getOrderItems() != null) {
            for (OrderItem oi : order.getOrderItems()) {
                itemDtos.add(new OrderItemDto(
                        oi.getId(),
                        oi.getProduct().getId(),
                        oi.getProduct().getName(),
                        oi.getQuantity(),
                        oi.getUnitPrice(),
                        oi.getTotalPrice()
                ));
            }
        }
        dto.setItems(itemDtos);
        return dto;
    }
}
