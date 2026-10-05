package com.lankanvibe.backend.dto;

import java.math.BigDecimal;

/**
 * OrderItemRequest - Line item details passed when creating an order
 */
public class OrderItemRequest {

    private Long productId;
    private String productName;
    private Integer quantity;
    private BigDecimal unitPrice;
    private String imageUrl;

    public OrderItemRequest() {}

    public OrderItemRequest(Long productId, String productName, Integer quantity, BigDecimal unitPrice, String imageUrl) {
        this.productId = productId;
        this.productName = productName;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.imageUrl = imageUrl;
    }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }

    public BigDecimal getUnitPrice() { return unitPrice; }
    public void setUnitPrice(BigDecimal unitPrice) { this.unitPrice = unitPrice; }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
}
