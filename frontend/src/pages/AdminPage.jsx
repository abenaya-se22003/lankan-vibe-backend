import React, { useState, useEffect } from 'react';
import { productAPI, orderAPI, imageAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiShield,
  FiBox,
  FiShoppingBag,
  FiImage,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiUploadCloud,
  FiCopy,
  FiCheck,
  FiRefreshCw,
  FiExternalLink,
} from 'react-icons/fi';
import { parseOptions, formatOptions, STANDARD_SIZES } from '../utils/productOptions';

const AdminPage = () => {
  const { user, isAdmin, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('products');

  // Products state
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Men',
    size: 'XS, S, M, L, (XL), XXL',
    color: 'Ocean Blue, (Sunset Coral)',
    imageUrl: '',
    stockQuantity: 20,
  });

  // Helper to toggle a size between Available -> Unavailable (X) -> Removed
  const toggleSizeInForm = (sizeName) => {
    const currentOptions = parseOptions(productForm.size);
    const existingIndex = currentOptions.findIndex(
      (opt) => opt.name.toUpperCase() === sizeName.toUpperCase()
    );

    let updated = [...currentOptions];
    if (existingIndex === -1) {
      // 1. Not in list -> Add as Available
      updated.push({ name: sizeName, available: true, raw: sizeName });
    } else if (updated[existingIndex].available) {
      // 2. Available -> Switch to Unavailable / Out of Stock
      updated[existingIndex].available = false;
    } else {
      // 3. Unavailable -> Remove from list
      updated.splice(existingIndex, 1);
    }

    const newSizeString = formatOptions(updated);
    setProductForm((prev) => ({ ...prev, size: newSizeString }));
  };

  // Orders state
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Cloudinary images state
  const [cloudinaryImages, setCloudinaryImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Load products
  const loadProducts = async () => {
    try {
      setProductsLoading(true);
      const data = await productAPI.getAll();
      setProducts(data);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setProductsLoading(false);
    }
  };

  // Load orders
  const loadOrders = async () => {
    try {
      setOrdersLoading(true);
      const data = await orderAPI.getAllOrders();
      setOrders(data || []);
    } catch (err) {
      toast.error('Failed to load admin orders');
    } finally {
      setOrdersLoading(false);
    }
  };

  // Load Cloudinary images
  const loadCloudinaryImages = async () => {
    try {
      setImagesLoading(true);
      const data = await imageAPI.getImages();
      setCloudinaryImages(data || []);
    } catch (err) {
      toast.error('Failed to fetch Cloudinary media');
    } finally {
      setImagesLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadProducts();
      loadOrders();
      loadCloudinaryImages();
    }
  }, [isAdmin]);

  // Product actions
  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setProductForm({
      name: '',
      description: '',
      price: '',
      category: 'Men',
      size: 'XS, S, M, L, (XL), XXL',
      color: 'Ocean Blue, (Sunset Coral)',
      imageUrl: '',
      stockQuantity: 20,
    });
    setProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod) => {
    setEditingProduct(prod);
    setProductForm({
      name: prod.name || '',
      description: prod.description || '',
      price: prod.price || '',
      category: prod.category || 'Men',
      size: prod.size || 'M',
      color: prod.color || '',
      imageUrl: prod.imageUrl || '',
      stockQuantity: prod.stockQuantity || 0,
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...productForm,
        price: parseFloat(productForm.price),
        stockQuantity: parseInt(productForm.stockQuantity, 10),
      };

      if (editingProduct) {
        await productAPI.update(editingProduct.id, payload);
        toast.success('Product updated successfully!');
      } else {
        await productAPI.create(payload);
        toast.success('Product added successfully!');
      }

      setProductModalOpen(false);
      loadProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save product');
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('Are you sure you want to remove this product?')) return;
    try {
      await productAPI.delete(id);
      toast.success('Product removed');
      loadProducts();
    } catch (err) {
      toast.error('Failed to delete product');
    }
  };

  // Order status update
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await orderAPI.updateStatus(orderId, newStatus);
      toast.success(`Order #${orderId} marked as ${newStatus}`);
      loadOrders();
    } catch (err) {
      toast.error('Failed to update order status');
    }
  };

  // Cloudinary upload
  const handleUploadImageFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadingImage(true);
      const res = await imageAPI.uploadImage(formData);
      toast.success('Image successfully uploaded to Cloudinary Lankan vibe folder!');
      loadCloudinaryImages();
      // Auto-fill into current modal if open
      if (productModalOpen && res?.secureUrl) {
        setProductForm((prev) => ({ ...prev, imageUrl: res.secureUrl }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCopyImageUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('Image URL copied to clipboard!');
  };

  const handleSelectImageForProduct = (url) => {
    setProductForm((prev) => ({ ...prev, imageUrl: url }));
    toast.success('Selected as product image!');
  };

  const formatLKR = (amount) =>
    new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      maximumFractionDigits: 0,
    }).format(amount);

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 min-h-screen text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto text-3xl">
          <FiShield />
        </div>
        <h2 className="text-2xl font-bold text-white">Admin Privileges Required</h2>
        <p className="text-xs text-gray-400">
          You must be logged in as an administrator to access the Lankan Vibe backoffice hub.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#e94560] to-[#c9a84c] text-white text-xs font-semibold"
        >
          Sign in as Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#1f233d]">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#c9a84c]/20 text-[#f1cb68]">
              <FiShield className="text-base" />
            </span>
            <span className="text-xs font-bold text-[#c9a84c] uppercase tracking-wider">
              Management Portal
            </span>
          </div>
          <h1 className="text-3xl font-black text-white mt-1">Lankan Vibe Backoffice</h1>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-[#121526] p-1.5 rounded-2xl border border-[#212642]">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'products'
                ? 'bg-[#e94560] text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FiBox /> <span>Products ({products.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'orders'
                ? 'bg-[#e94560] text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FiShoppingBag /> <span>Orders ({orders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('cloudinary')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'cloudinary'
                ? 'bg-[#e94560] text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FiImage /> <span>Cloudinary ({cloudinaryImages.length})</span>
          </button>
        </div>
      </div>

      {/* ================= PRODUCTS TAB ================= */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Apparel Catalog</h2>
            <button
              onClick={handleOpenAddProduct}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#e94560] to-[#c9a84c] text-white text-xs font-semibold hover:opacity-95 transition shadow-lg"
            >
              <FiPlus /> <span>Add New Apparel</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-[#1f233d] bg-[#111424]">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0c0e1a] text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#1f233d]">
                <tr>
                  <th className="py-4 px-6">Product</th>
                  <th className="py-4 px-4">Category</th>
                  <th className="py-4 px-4">Price</th>
                  <th className="py-4 px-4">Stock</th>
                  <th className="py-4 px-4">Size/Color</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2038]">
                {productsLoading ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-gray-500">
                      Loading products...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-gray-500">
                      No products found. Add your first item!
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-4 px-6 flex items-center gap-3">
                        <img
                          src={p.imageUrl || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600'}
                          alt=""
                          className="w-10 h-12 rounded-lg object-cover bg-[#090a12] shrink-0"
                        />
                        <div>
                          <p className="font-bold text-white">{p.name}</p>
                          <p className="text-[10px] text-gray-500 line-clamp-1 max-w-xs">
                            {p.description}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="px-2.5 py-1 rounded-md bg-[#191d33] text-[#c9a84c] border border-[#c9a84c]/20 font-semibold text-[10px]">
                          {p.category}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-bold text-white">{formatLKR(p.price)}</td>
                      <td className="py-4 px-4">
                        <span
                          className={`font-semibold ${
                            p.stockQuantity > 5 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {p.stockQuantity} units
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-300">
                        <div className="flex flex-wrap gap-1 items-center max-w-[220px]">
                          {parseOptions(p.size, ['M']).map((s) => (
                            <span
                              key={s.name}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                s.available
                                  ? 'bg-[#1b2238] text-white border border-[#2b3558]'
                                  : 'bg-red-950/40 text-red-400 border border-red-800/40 line-through'
                              }`}
                              title={s.available ? `${s.name} (Available)` : `${s.name} (Out of Stock)`}
                            >
                              {s.name}
                            </span>
                          ))}
                        </div>
                        {p.color && (
                          <div className="text-[10px] text-gray-400 mt-1 truncate max-w-[220px]" title={p.color}>
                            {p.color}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditProduct(p)}
                          className="p-2 rounded-lg bg-[#191d33] hover:text-white transition"
                          title="Edit Product"
                        >
                          <FiEdit2 className="text-xs" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="p-2 rounded-lg bg-[#191d33] hover:text-red-400 transition"
                          title="Delete Product"
                        >
                          <FiTrash2 className="text-xs" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= ORDERS TAB ================= */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Customer Orders Management</h2>
            <button
              onClick={loadOrders}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#15192d] text-xs text-gray-300 hover:text-white"
            >
              <FiRefreshCw className="text-xs" /> Refresh
            </button>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-[#1f233d] bg-[#111424]">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0c0e1a] text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#1f233d]">
                <tr>
                  <th className="py-4 px-6">Order ID & Date</th>
                  <th className="py-4 px-4">Customer Details</th>
                  <th className="py-4 px-4">Destination</th>
                  <th className="py-4 px-4">Total & Payment</th>
                  <th className="py-4 px-4">Items</th>
                  <th className="py-4 px-6 text-right">Fulfillment Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2038]">
                {ordersLoading ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-gray-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-gray-500">
                      No customer orders have been placed yet.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-4 px-6">
                        <span className="font-bold text-[#c9a84c]">#{o.id}</span>
                        <p className="text-[10px] text-gray-500">
                          {o.orderDate ? new Date(o.orderDate).toLocaleDateString() : (o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'Recent')}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-bold text-white">{o.customerName || 'Customer'}</p>
                        <p className="text-[10px] text-gray-400">{o.userEmail || o.customerEmail}</p>
                        <p className="text-[10px] text-gray-400">{o.phone}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-xs">{o.city}</p>
                        <p className="text-[10px] text-gray-400 line-clamp-1">{o.shippingAddress}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-bold text-white">{formatLKR(o.totalAmount)}</p>
                        <p className="text-[10px] text-[#c9a84c] uppercase font-semibold">
                          {o.paymentMethod || 'COD'}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-xs text-gray-300">
                          {o.items?.length || 0} items
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <select
                          value={o.status || 'PENDING'}
                          onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                          className="bg-[#15192c] text-xs font-semibold text-white border border-[#272d4f] rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="PROCESSING">PROCESSING</option>
                          <option value="SHIPPED">SHIPPED</option>
                          <option value="DELIVERED">DELIVERED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= CLOUDINARY MEDIA ASSETS TAB ================= */}
      {activeTab === 'cloudinary' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#111424] border border-[#1e233d]">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#c9a84c]">
                Cloudinary Asset Library
              </span>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Folder: <code className="text-[#e94560] font-mono">samples/Lankan vibe</code>
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Connected to Cloudinary account <strong>dprastyf2</strong> with {cloudinaryImages.length} live images.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#e94560] to-[#c9a84c] text-white text-xs font-semibold cursor-pointer hover:opacity-95 transition shadow-lg">
                <FiUploadCloud className="text-sm" />
                <span>{uploadingImage ? 'Uploading...' : 'Upload Image to Cloudinary'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadImageFile}
                  disabled={uploadingImage}
                  className="hidden"
                />
              </label>
              <button
                onClick={loadCloudinaryImages}
                className="p-2.5 rounded-xl bg-[#191d33] text-gray-300 hover:text-white"
                title="Refresh Images"
              >
                <FiRefreshCw className="text-sm" />
              </button>
            </div>
          </div>

          {imagesLoading ? (
            <div className="py-20 text-center text-gray-500 text-xs">
              Loading Cloudinary gallery...
            </div>
          ) : cloudinaryImages.length === 0 ? (
            <div className="py-16 text-center rounded-3xl bg-[#111424] border border-[#1e233d] space-y-2">
              <p className="text-sm font-semibold text-white">No images found in folder</p>
              <p className="text-xs text-gray-500">Upload your first apparel image to Cloudinary.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {cloudinaryImages.map((img) => (
                <div
                  key={img.publicId}
                  className="group relative rounded-2xl bg-[#0c0e1a] border border-[#1f233d] overflow-hidden hover:border-[#c9a84c] transition flex flex-col justify-between"
                >
                  <div className="aspect-square w-full overflow-hidden bg-[#07080f]">
                    <img
                      src={img.secureUrl || img.url}
                      alt={img.publicId}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  </div>
                  <div className="p-2.5 bg-[#111424] space-y-1.5">
                    <p className="text-[10px] font-mono text-gray-400 truncate" title={img.publicId}>
                      {img.publicId}
                    </p>
                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#1c2038]">
                      <button
                        onClick={() => handleCopyImageUrl(img.secureUrl || img.url)}
                        className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5 text-[10px] flex items-center gap-1"
                        title="Copy URL"
                      >
                        <FiCopy /> URL
                      </button>
                      <button
                        onClick={() => handleSelectImageForProduct(img.secureUrl || img.url)}
                        className="p-1 rounded-md text-[#c9a84c] hover:bg-[#c9a84c]/10 text-[10px] font-semibold"
                        title="Use as Product Image"
                      >
                        Select
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= PRODUCT ADD / EDIT MODAL ================= */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl rounded-3xl bg-[#111424] border border-[#2b3052] p-6 sm:p-8 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#1f233d]">
              <h3 className="text-lg font-bold text-white">
                {editingProduct ? 'Edit Lankan Vibe Piece' : 'Add New Island Apparel'}
              </h3>
              <button
                onClick={() => setProductModalOpen(false)}
                className="text-gray-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Classic Handloom Batik Shirt"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  required
                  className="w-full bg-[#0c0e1a] text-xs text-white rounded-xl p-3 border border-[#232742] focus:outline-none focus:border-[#e94560]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  rows="3"
                  placeholder="Tell the craft story, material origin, and fit details..."
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  className="w-full bg-[#0c0e1a] text-xs text-white rounded-xl p-3 border border-[#232742] focus:outline-none focus:border-[#e94560]"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Price (LKR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="4500"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    required
                    className="w-full bg-[#0c0e1a] text-xs text-white rounded-xl p-3 border border-[#232742] focus:outline-none focus:border-[#e94560]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Stock Quantity *
                  </label>
                  <input
                    type="number"
                    placeholder="25"
                    value={productForm.stockQuantity}
                    onChange={(e) =>
                      setProductForm({ ...productForm, stockQuantity: e.target.value })
                    }
                    required
                    className="w-full bg-[#0c0e1a] text-xs text-white rounded-xl p-3 border border-[#232742] focus:outline-none focus:border-[#e94560]"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Category *
                </label>
                <select
                  value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                  className="w-full bg-[#0c0e1a] text-xs text-white rounded-xl p-3 border border-[#232742] focus:outline-none focus:border-[#e94560]"
                >
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                  <option value="Unisex">Unisex</option>
                  <option value="Accessories">Accessories</option>
                  <option value="Casual">Casual</option>
                </select>
              </div>

              {/* ─── SIZES SECTION (Interactive Builder) ─── */}
              <div className="bg-[#0c0e1a] p-4 rounded-2xl border border-[#232742] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-200 uppercase tracking-wider">
                    Sizes & Stock Availability
                  </label>
                  <span className="text-[10px] text-gray-400">
                    Click chip to cycle: Available ✓ → Out of Stock (X) → Remove
                  </span>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap gap-2">
                  {STANDARD_SIZES.map((sz) => {
                    const currentSizes = parseOptions(productForm.size);
                    const found = currentSizes.find(
                      (item) => item.name.toUpperCase() === sz.toUpperCase()
                    );
                    const isAvailable = found && found.available;
                    const isUnavailable = found && !found.available;

                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => toggleSizeInForm(sz)}
                        title={
                          !found
                            ? `Click to add ${sz}`
                            : isAvailable
                            ? `Click to mark ${sz} as out of stock (X)`
                            : `Click to remove ${sz}`
                        }
                        className={`relative min-w-[50px] h-9 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 border ${
                          isAvailable
                            ? 'bg-[#1e293b] text-white border-emerald-500/70 shadow-sm'
                            : isUnavailable
                            ? 'bg-[#1c121e] text-red-300 border-red-500/70'
                            : 'bg-[#131626] text-gray-400 border-[#232742] hover:border-gray-500'
                        }`}
                      >
                        <span>{sz}</span>
                        {isAvailable && <span className="text-[11px] text-emerald-400">✓</span>}
                        {isUnavailable && (
                          <>
                            <span className="text-[10px] text-red-400 font-bold">(OOS)</span>
                            <svg
                              className="absolute inset-0 w-full h-full pointer-events-none stroke-red-500/50"
                              preserveAspectRatio="none"
                              viewBox="0 0 100 100"
                            >
                              <line x1="0" y1="0" x2="100" y2="100" strokeWidth="1.5" stroke="currentColor" />
                              <line x1="100" y1="0" x2="0" y2="100" strokeWidth="1.5" stroke="currentColor" />
                            </svg>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Direct Text Input */}
                <div>
                  <input
                    type="text"
                    placeholder="e.g. XS, S, M, L, (XL), XXL"
                    value={productForm.size}
                    onChange={(e) => setProductForm({ ...productForm, size: e.target.value })}
                    className="w-full bg-[#131626] text-xs text-white rounded-xl p-3 border border-[#232742] focus:outline-none focus:border-[#e94560]"
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Wrap unavailable sizes in parentheses like <span className="text-white font-mono bg-[#1c2038] px-1 py-0.5 rounded">(XL)</span> to display them with a diagonal crossed-out X.
                  </p>
                </div>

                {/* Live Customer Preview */}
                {productForm.size && (
                  <div className="pt-2 border-t border-[#1e233d]">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                      Customer Store Preview:
                    </span>
                    <div className="flex flex-wrap gap-2 bg-neutral-100 p-2.5 rounded-xl border border-neutral-300">
                      {parseOptions(productForm.size).map((item) => (
                        <div
                          key={item.name}
                          className={`relative min-w-[44px] h-10 px-2 rounded border flex items-center justify-center text-xs font-semibold ${
                            item.available
                              ? 'bg-white text-neutral-900 border-neutral-300'
                              : 'bg-white text-neutral-400 border-neutral-300'
                          }`}
                        >
                          <span className={!item.available ? 'text-neutral-400 font-normal' : ''}>
                            {item.name}
                          </span>
                          {!item.available && (
                            <svg
                              className="absolute inset-0 w-full h-full pointer-events-none stroke-neutral-400"
                              preserveAspectRatio="none"
                              viewBox="0 0 100 100"
                            >
                              <line x1="0" y1="0" x2="100" y2="100" strokeWidth="1.2" stroke="currentColor" />
                              <line x1="100" y1="0" x2="0" y2="100" strokeWidth="1.2" stroke="currentColor" />
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ─── COLOR / MOTIF SECTION (Interactive Builder) ─── */}
              <div className="bg-[#0c0e1a] p-4 rounded-2xl border border-[#232742] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-200 uppercase tracking-wider">
                    Colors / Motifs
                  </label>
                  <span className="text-[10px] text-gray-400">
                    Use (Color) for out-of-stock
                  </span>
                </div>

                <input
                  type="text"
                  placeholder="e.g. Ocean Blue, (Sunset Coral), Off White"
                  value={productForm.color}
                  onChange={(e) => setProductForm({ ...productForm, color: e.target.value })}
                  className="w-full bg-[#131626] text-xs text-white rounded-xl p-3 border border-[#232742] focus:outline-none focus:border-[#e94560]"
                />
                <p className="text-[11px] text-gray-400">
                  Wrap unavailable colors in parentheses like <span className="text-white font-mono bg-[#1c2038] px-1 py-0.5 rounded">(Sunset Coral)</span> to display as crossed out.
                </p>

                {/* Live Customer Preview */}
                {productForm.color && (
                  <div className="pt-2 border-t border-[#1e233d]">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                      Customer Store Preview:
                    </span>
                    <div className="flex flex-wrap gap-2 bg-neutral-100 p-2.5 rounded-xl border border-neutral-300">
                      {parseOptions(productForm.color).map((item) => (
                        <div
                          key={item.name}
                          className={`relative px-3 h-8 rounded border flex items-center justify-center text-xs font-semibold ${
                            item.available
                              ? 'bg-white text-neutral-900 border-neutral-300'
                              : 'bg-white text-neutral-400 border-neutral-300'
                          }`}
                        >
                          <span className={!item.available ? 'text-neutral-400 font-normal' : ''}>
                            {item.name}
                          </span>
                          {!item.available && (
                            <svg
                              className="absolute inset-0 w-full h-full pointer-events-none stroke-neutral-400"
                              preserveAspectRatio="none"
                              viewBox="0 0 100 100"
                            >
                              <line x1="0" y1="0" x2="100" y2="100" strokeWidth="1.2" stroke="currentColor" />
                              <line x1="100" y1="0" x2="0" y2="100" strokeWidth="1.2" stroke="currentColor" />
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-300">Image URL</label>
                  <span className="text-[10px] text-gray-500">
                    Paste URL or pick from Cloudinary tab
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="https://res.cloudinary.com/..."
                  value={productForm.imageUrl}
                  onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
                  className="w-full bg-[#0c0e1a] text-xs text-white rounded-xl p-3 border border-[#232742] focus:outline-none focus:border-[#e94560]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1f233d]">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#191d33] text-xs font-semibold text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#e94560] to-[#c9a84c] text-white text-xs font-bold hover:opacity-90 transition shadow-lg"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
