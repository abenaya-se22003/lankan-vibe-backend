package com.lankanvibe.backend.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * CreateOrderRequest - Payload to place an order from the user's cart
 */
public class CreateOrderRequest {

    @NotBlank(message = "Shipping address is required")
    private String shippingAddress;

    private String paymentMethod = "COD";
    private String email;
    private String customerName;
    private String phone;
    private String city;
    private String postalCode;
    private java.util.List<OrderItemRequest> items;

    public CreateOrderRequest() {}

    public CreateOrderRequest(String shippingAddress, String paymentMethod) {
        this.shippingAddress = shippingAddress;
        this.paymentMethod = paymentMethod;
    }

    public String getShippingAddress() { return shippingAddress; }
    public void setShippingAddress(String shippingAddress) { this.shippingAddress = shippingAddress; }

    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getPostalCode() { return postalCode; }
    public void setPostalCode(String postalCode) { this.postalCode = postalCode; }

    public java.util.List<OrderItemRequest> getItems() { return items; }
    public void setItems(java.util.List<OrderItemRequest> items) { this.items = items; }
}
