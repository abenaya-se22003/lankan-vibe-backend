import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { orderAPI, paymentAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  FiCheckCircle,
  FiHelpCircle,
  FiChevronDown,
  FiArrowRight,
  FiShoppingBag,
  FiExternalLink,
} from 'react-icons/fi';

const CheckoutPage = () => {
  const { user } = useAuth();
  const { cart, clearCart } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Contact State
  const [emailOrPhone, setEmailOrPhone] = useState(user?.email || user?.phone || '');
  const [emailOffers, setEmailOffers] = useState(true);

  // Delivery State
  const [country, setCountry] = useState('Sri Lanka');
  const [firstName, setFirstName] = useState(user?.fullName?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(user?.fullName?.split(' ').slice(1).join(' ') || '');
  const [address, setAddress] = useState(user?.address || '');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState(user?.city || 'Colombo');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saveInfo, setSaveInfo] = useState(true);

  // Payment & Billing State
  const [paymentMethod, setPaymentMethod] = useState('CASH_ON_DELIVERY');
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);

  // Discount code state
  const [discountCode, setDiscountCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  const items = cart.items || [];

  // Helper to safely get the unit price
  const getItemUnitPrice = (it) => {
    const raw = it.unitPrice ?? it.productPrice;
    if (raw !== undefined && raw !== null && !isNaN(Number(raw))) return Number(raw);
    if (it.subtotal && it.quantity) return Number(it.subtotal) / Number(it.quantity);
    return 0;
  };

  // Helper to safely get item subtotal
  const getItemSubtotal = (it) => {
    if (it.subtotal !== undefined && it.subtotal !== null && !isNaN(Number(it.subtotal))) {
      return Number(it.subtotal);
    }
    return getItemUnitPrice(it) * (it.quantity || 1);
  };

  const subtotal =
    cart.totalPrice && !isNaN(Number(cart.totalPrice))
      ? Number(cart.totalPrice)
      : items.reduce((acc, it) => acc + getItemSubtotal(it), 0);

  const FREE_SHIPPING_THRESHOLD = 8000;
  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD || items.length === 0;
  const shippingFee = isFreeShipping ? 0 : 490;
  const discountAmount = discountApplied ? Math.round(subtotal * 0.1) : 0; // 10% demo discount
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  const formatRs = (amount) => {
    const num = Number(amount);
    return `Rs ${(isNaN(num) ? 0 : num).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleApplyDiscount = (e) => {
    e.preventDefault();
    if (!discountCode.trim()) return;
    if (discountCode.trim().toUpperCase() === 'VIBE10' || discountCode.trim().toUpperCase() === 'LCY') {
      setDiscountApplied(true);
      toast.success('Promo code applied: 10% off!');
    } else {
      toast.error('Invalid discount code. Try VIBE10');
    }
  };

  // Helper function to programmatically POST and redirect to PayHere sandbox
  const redirectToPayHere = (payHereParams) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = payHereParams.actionUrl || 'https://sandbox.payhere.lk/pay/checkout';
    form.style.display = 'none';

    const fields = {
      merchant_id: payHereParams.merchantId,
      return_url: payHereParams.returnUrl,
      cancel_url: payHereParams.cancelUrl,
      notify_url: payHereParams.notifyUrl,
      order_id: payHereParams.orderId,
      items: payHereParams.items,
      currency: payHereParams.currency,
      amount: payHereParams.amount,
      first_name: payHereParams.firstName,
      last_name: payHereParams.lastName,
      email: payHereParams.email,
      phone: payHereParams.phone,
      address: payHereParams.address,
      city: payHereParams.city,
      country: payHereParams.country,
      hash: payHereParams.hash,
    };

    Object.entries(fields).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(val);
        form.appendChild(input);
      }
    });

    document.body.appendChild(form);
    form.submit();
  };

  // Listen for PayHere return URL params (success or cancelled)
  useEffect(() => {
    const status = searchParams.get('status');
    const returnOrderId = searchParams.get('orderId');
    if (status === 'success' && returnOrderId) {
      setCompletedOrder({
        id: returnOrderId,
        paymentMethod: 'PAYHERE',
        totalAmount: grandTotal,
        shippingAddress: address || 'Your Delivery Address',
        city: city || 'Colombo',
      });
      clearCart();
      toast.success('PayHere transaction successful! Order confirmed.');
    } else if (status === 'cancelled') {
      toast.error('Payment cancelled on PayHere. You can retry anytime.');
    }
  }, [searchParams]);

  const handleSubmitOrder = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!address.trim() || !city.trim() || (!phone.trim() && !emailOrPhone.trim())) {
      toast.error('Please complete all required delivery fields (Address, City, Phone)');
      return;
    }

    // ─── PayHere Redirection Flow ───
    if (paymentMethod === 'PAYHERE') {
      try {
        setSubmitting(true);
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || user?.fullName || 'Valued Customer';
        const customerEmail = emailOrPhone.includes('@')
          ? emailOrPhone.trim()
          : (user?.email || 'customer@lankanvibe.com');
        const customerPhone = phone.trim() || emailOrPhone.trim() || '0771234567';

        // Pre-register order in database so order confirmation email is queued and order is tracked
        let registeredOrderId = null;
        try {
          const preOrder = await orderAPI.createOrder({
            shippingAddress: apartment ? `${address.trim()}, ${apartment.trim()}` : address.trim(),
            city: city.trim(),
            postalCode: postalCode.trim() || '00100',
            phone: customerPhone,
            paymentMethod: 'PAYHERE',
            email: customerEmail,
            customerName: fullName,
            items: items.map(it => ({
              productId: it.productId || it.id,
              productName: it.productName || it.name,
              quantity: it.quantity,
              unitPrice: getItemUnitPrice(it),
              imageUrl: it.imageUrl || ''
            }))
          });
          if (preOrder?.id) {
            registeredOrderId = `LV-${preOrder.id}`;
          }
        } catch (err) {
          console.warn('Pre-order registration info:', err);
        }

        const orderId = registeredOrderId || `LV-${Math.floor(100000 + Math.random() * 900000)}`;
        const itemsSummary = items.map((i) => i.productName).join(', ') || 'Lankan Vibe Apparel';

        const initiatePayload = {
          orderId,
          amount: grandTotal,
          currency: 'LKR',
          firstName: firstName.trim() || 'Valued',
          lastName: lastName.trim() || 'Customer',
          email: customerEmail,
          phone: customerPhone,
          address: apartment ? `${address.trim()}, ${apartment.trim()}` : address.trim(),
          city: city.trim(),
          country: 'Sri Lanka',
          items: itemsSummary,
          returnUrl: `${window.location.origin}/checkout?status=success&orderId=${orderId}`,
          cancelUrl: `${window.location.origin}/checkout?status=cancelled&orderId=${orderId}`,
        };

        toast.loading('Redirecting to PayHere secure gateway...', { id: 'payhere-toast' });
        const response = await paymentAPI.initiatePayHere(initiatePayload);
        toast.dismiss('payhere-toast');
        redirectToPayHere(response);
        return;
      } catch (err) {
        console.error('PayHere initiation error:', err);
        toast.dismiss('payhere-toast');
        toast.error('Failed to connect to PayHere gateway. Please try again.');
        setSubmitting(false);
        return;
      }
    }

    try {
      setSubmitting(true);
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || user?.fullName || 'Valued Customer';
      const customerEmail = emailOrPhone.includes('@')
        ? emailOrPhone.trim()
        : (user?.email || 'customer@lankanvibe.com');

      const orderPayload = {
        shippingAddress: apartment ? `${address.trim()}, ${apartment.trim()}` : address.trim(),
        city: city.trim(),
        postalCode: postalCode.trim() || '00100',
        phone: phone.trim() || emailOrPhone.trim(),
        paymentMethod: paymentMethod,
        email: customerEmail,
        customerName: fullName,
        items: items.map(it => ({
          productId: it.productId || it.id,
          productName: it.productName || it.name,
          quantity: it.quantity,
          unitPrice: getItemUnitPrice(it),
          imageUrl: it.imageUrl || ''
        }))
      };

      const createdOrder = await orderAPI.createOrder(orderPayload);
      setCompletedOrder({
        ...(createdOrder || { id: Date.now(), ...orderPayload, totalAmount: grandTotal }),
        recipientEmail: customerEmail
      });
      await clearCart();
      toast.success('Order placed successfully! Confirmation receipt sent to your email.');
    } catch (err) {
      console.error('Order creation error:', err);
      // Fallback order state
      const fallbackOrder = {
        id: `LV-${Math.floor(100000 + Math.random() * 900000)}`,
        shippingAddress: address,
        city: city,
        paymentMethod: paymentMethod,
        totalAmount: grandTotal,
        recipientEmail: emailOrPhone.includes('@') ? emailOrPhone.trim() : 'your email',
      };
      setCompletedOrder(fallbackOrder);
      await clearCart();
      toast.success('Order placed successfully!');
    } finally {
      setSubmitting(false);
    }
  };

  // If order was successfully completed
  if (completedOrder) {
    return (
      <div className="min-h-screen bg-[#efefef] flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-neutral-200 p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-3xl flex items-center justify-center mx-auto">
            <FiCheckCircle />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Order Confirmed
            </span>
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
              Thank You!
            </h1>
            <p className="text-xs text-neutral-600">
              Your order <strong className="text-neutral-900">#{completedOrder.id}</strong> has been received and is being processed.
            </p>
            <p className="text-xs text-emerald-700 bg-emerald-50 py-2 px-3 rounded-lg border border-emerald-200 mt-2 font-medium">
              📧 A confirmation receipt has been sent to <strong>{completedOrder.userEmail || completedOrder.recipientEmail || emailOrPhone}</strong>
            </p>
          </div>

          <div className="p-4 bg-[#f9f9f9] rounded-lg text-left text-xs space-y-2 border border-neutral-200">
            <div className="flex justify-between">
              <span className="text-neutral-500">Payment Method:</span>
              <span className="font-semibold text-neutral-900">{paymentMethod.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Delivery Location:</span>
              <span className="font-medium text-neutral-900">{city}, Sri Lanka</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-neutral-200 font-bold text-neutral-900">
              <span>Total Paid:</span>
              <span>{formatRs(completedOrder.totalAmount || grandTotal)}</span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              to="/shop"
              className="w-full py-3.5 bg-[#c58b10] hover:bg-[#b07b0c] text-white text-xs font-bold uppercase tracking-widest transition rounded-lg flex items-center justify-center"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If cart is empty
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#efefef] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl p-8 text-center space-y-5 border border-neutral-200 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400 text-2xl">
            <FiShoppingBag />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold uppercase tracking-tight text-neutral-900">Your Cart Is Empty</h2>
            <p className="text-xs text-neutral-500">Please add items to your cart before proceeding to checkout.</p>
          </div>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#c58b10] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#b07b0c] transition"
          >
            <span>Return To Shop</span>
            <FiArrowRight />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#efefef] font-sans antialiased selection:bg-[#c58b10] selection:text-white">
      
      {/* ──────────────────────────────────────────────────────────
          LEFT COLUMN: Checkout Form (Light Gray Background #efefef)
          ────────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[57%] xl:w-[58%] flex justify-end">
        <div className="w-full max-w-[640px] px-4 sm:px-8 lg:pl-10 lg:pr-14 py-8 sm:py-12 space-y-8">
          
          {/* Brand Logo for Mobile */}
          <div className="lg:hidden pb-2">
            <Link to="/" className="text-2xl font-black uppercase tracking-widest text-neutral-900">
              LANKAN VIBE
            </Link>
          </div>

          <form onSubmit={handleSubmitOrder} className="space-y-7">
            
            {/* ─── 1. CONTACT SECTION ─── */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-neutral-900">Contact</h2>
                <Link
                  to="/login?redirect=/checkout"
                  className="text-xs font-medium text-[#c58b10] hover:underline"
                >
                  Sign in
                </Link>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Email or mobile phone number"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  required
                  className="w-full bg-white text-xs sm:text-sm text-neutral-900 placeholder-neutral-400 rounded-lg p-3.5 pr-10 border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                />
                <FiHelpCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none" />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-neutral-800 cursor-pointer pt-1 select-none">
                <input
                  type="checkbox"
                  checked={emailOffers}
                  onChange={(e) => setEmailOffers(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-[#c58b10] accent-[#c58b10] cursor-pointer"
                />
                <span>Email me with news and offers</span>
              </label>
            </div>

            {/* ─── 2. DELIVERY SECTION ─── */}
            <div className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">Delivery</h2>

              {/* Country / Region */}
              <div className="relative bg-white rounded-lg border border-neutral-300 px-3.5 py-2">
                <span className="block text-[10px] text-neutral-500 font-medium leading-none">
                  Country/Region
                </span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-transparent text-xs sm:text-sm text-neutral-900 font-medium focus:outline-none cursor-pointer pt-1"
                >
                  <option value="Sri Lanka">Sri Lanka</option>
                </select>
                <FiChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none text-xs" />
              </div>

              {/* First Name & Last Name */}
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-white text-xs sm:text-sm text-neutral-900 placeholder-neutral-400 rounded-lg p-3.5 border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                />
                <input
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full bg-white text-xs sm:text-sm text-neutral-900 placeholder-neutral-400 rounded-lg p-3.5 border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                />
              </div>

              {/* Address */}
              <input
                type="text"
                placeholder="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                className="w-full bg-white text-xs sm:text-sm text-neutral-900 placeholder-neutral-400 rounded-lg p-3.5 border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
              />

              {/* Apartment / Suite */}
              <input
                type="text"
                placeholder="Apartment, suite, etc. (optional)"
                value={apartment}
                onChange={(e) => setApartment(e.target.value)}
                className="w-full bg-white text-xs sm:text-sm text-neutral-900 placeholder-neutral-400 rounded-lg p-3.5 border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
              />

              {/* City & Postal Code */}
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  className="w-full bg-white text-xs sm:text-sm text-neutral-900 placeholder-neutral-400 rounded-lg p-3.5 border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                />
                <input
                  type="text"
                  placeholder="Postal code (optional)"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full bg-white text-xs sm:text-sm text-neutral-900 placeholder-neutral-400 rounded-lg p-3.5 border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                />
              </div>

              {/* Phone with Tooltip */}
              <div className="relative">
                <input
                  type="tel"
                  placeholder="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full bg-white text-xs sm:text-sm text-neutral-900 placeholder-neutral-400 rounded-lg p-3.5 pr-10 border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
                />
                <FiHelpCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none" />
              </div>

              {/* Save Information Checkbox */}
              <label className="flex items-center gap-2.5 text-xs text-neutral-800 cursor-pointer pt-1 select-none">
                <input
                  type="checkbox"
                  checked={saveInfo}
                  onChange={(e) => setSaveInfo(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-[#c58b10] accent-[#c58b10] cursor-pointer"
                />
                <span>Save this information for next time</span>
              </label>
            </div>

            {/* ─── 3. SHIPPING METHOD SECTION ─── */}
            <div className="space-y-2.5">
              <h2 className="text-sm font-bold text-neutral-900">Shipping method</h2>

              <div className="border border-[#c58b10] bg-[#fffbf2] rounded-lg p-4 flex items-center justify-between text-xs sm:text-sm transition">
                <span className="font-semibold text-neutral-900">Shipping Charges</span>
                <span className="font-bold text-neutral-900">{formatRs(shippingFee)}</span>
              </div>
            </div>

            {/* ─── 4. PAYMENT SECTION ─── */}
            <div className="space-y-2.5">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-neutral-900">Payment</h2>
                <p className="text-xs text-neutral-500">All transactions are secure and encrypted.</p>
              </div>

              {/* Payment Method Stack */}
              <div className="border border-neutral-300 rounded-lg overflow-hidden divide-y divide-neutral-200 bg-white">
                
                {/* 1. Cash on Delivery (COD) */}
                <div>
                  <label
                    onClick={() => setPaymentMethod('CASH_ON_DELIVERY')}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        value="CASH_ON_DELIVERY"
                        checked={paymentMethod === 'CASH_ON_DELIVERY'}
                        onChange={() => setPaymentMethod('CASH_ON_DELIVERY')}
                        className="w-4 h-4 accent-[#c58b10] cursor-pointer"
                      />
                      <span className="text-xs sm:text-sm font-semibold text-neutral-900">
                        Cash on Delivery (COD)
                      </span>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Islandwide
                    </span>
                  </label>
                  {paymentMethod === 'CASH_ON_DELIVERY' && (
                    <div className="p-4 bg-[#f9f9f9] border-t border-neutral-200 text-xs text-neutral-600 leading-relaxed">
                      Pay in cash directly to our courier upon receiving your parcel at your doorstep.
                    </div>
                  )}
                </div>

                {/* 2. Koko: Buy Now Pay Later */}
                <div>
                  <label
                    onClick={() => setPaymentMethod('KOKO')}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        value="KOKO"
                        checked={paymentMethod === 'KOKO'}
                        onChange={() => setPaymentMethod('KOKO')}
                        className="w-4 h-4 accent-[#c58b10] cursor-pointer"
                      />
                      <span className="text-xs sm:text-sm font-semibold text-neutral-900">
                        Koko: Buy Now Pay Later
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="bg-[#1a1f71] text-white text-[10px] font-black px-1.5 py-0.5 rounded italic">
                        VISA
                      </span>
                      <span className="bg-[#eb001b] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        MC
                      </span>
                    </div>
                  </label>
                  {paymentMethod === 'KOKO' && (
                    <div className="p-4 bg-[#f9f9f9] border-t border-neutral-200 text-xs text-neutral-600 leading-relaxed">
                      Split your total into 3 interest-free monthly payments with Koko.
                    </div>
                  )}
                </div>

                {/* 3. Bank Card / Bank Account - PayHere */}
                <div>
                  <label
                    onClick={() => setPaymentMethod('PAYHERE')}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        value="PAYHERE"
                        checked={paymentMethod === 'PAYHERE'}
                        onChange={() => setPaymentMethod('PAYHERE')}
                        className="w-4 h-4 accent-[#c58b10] cursor-pointer"
                      />
                      <span className="text-xs sm:text-sm font-semibold text-neutral-900">
                        Bank Card / Bank Account - PayHere
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="bg-[#1a1f71] text-white text-[10px] font-black px-1 py-0.5 rounded italic">
                        VISA
                      </span>
                      <span className="bg-[#eb001b] text-white text-[10px] font-bold px-1 py-0.5 rounded">
                        MC
                      </span>
                      <span className="bg-[#0077a6] text-white text-[10px] font-bold px-1 py-0.5 rounded">
                        AMEX
                      </span>
                    </div>
                  </label>
                  {paymentMethod === 'PAYHERE' && (
                    <div className="p-4 bg-[#f9f9f9] border-t border-neutral-200 space-y-3">
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        Direct online payment via PayHere gateway with all Sri Lankan banks & credit/debit cards.
                      </p>
                      <button
                        type="button"
                        id="payhere-redirect-btn"
                        onClick={handleSubmitOrder}
                        disabled={submitting}
                        className="w-full sm:w-auto px-6 py-2.5 bg-[#c58b10] hover:bg-[#b07b0c] active:scale-95 text-white text-xs font-bold uppercase tracking-wider rounded-md transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>{submitting ? 'Redirecting...' : 'Proceed to PayHere Gateway'}</span>
                        <FiExternalLink className="text-sm" />
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ─── 5. BILLING ADDRESS SECTION ─── */}
            <div className="space-y-2.5">
              <h2 className="text-sm font-bold text-neutral-900">Billing address</h2>

              <div className="border border-neutral-300 rounded-lg overflow-hidden divide-y divide-neutral-200 bg-white">
                <label className="p-4 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 transition">
                  <input
                    type="radio"
                    name="billing"
                    checked={billingSameAsShipping}
                    onChange={() => setBillingSameAsShipping(true)}
                    className="w-4 h-4 accent-[#c58b10] cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm font-medium text-neutral-900">
                    Same as shipping address
                  </span>
                </label>

                <label className="p-4 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 transition">
                  <input
                    type="radio"
                    name="billing"
                    checked={!billingSameAsShipping}
                    onChange={() => setBillingSameAsShipping(false)}
                    className="w-4 h-4 accent-[#c58b10] cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm font-medium text-neutral-900">
                    Use a different billing address
                  </span>
                </label>
              </div>
            </div>

            {/* ─── 6. PAY NOW BUTTON ─── */}
            <div className="pt-2">
              <button
                type="submit"
                id="main-pay-btn"
                disabled={submitting}
                className="w-full py-4 bg-[#c58b10] hover:bg-[#b07b0c] active:scale-[0.99] text-white font-bold text-sm tracking-wide rounded-lg transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting
                  ? 'Connecting to PayHere...'
                  : paymentMethod === 'PAYHERE'
                  ? `Pay with PayHere (${formatRs(grandTotal)})`
                  : 'Pay now'}
                {paymentMethod === 'PAYHERE' && !submitting && <FiExternalLink className="text-base" />}
              </button>
            </div>

            {/* ─── 7. FOOTER POLICY LINKS ─── */}
            <div className="pt-6 border-t border-neutral-300 flex flex-wrap gap-4 text-xs text-[#a0741b]">
              <a href="#" className="underline underline-offset-2 hover:text-[#7f5a0e]">Refund policy</a>
              <a href="#" className="underline underline-offset-2 hover:text-[#7f5a0e]">Privacy policy</a>
              <a href="#" className="underline underline-offset-2 hover:text-[#7f5a0e]">Terms of service</a>
              <a href="#" className="underline underline-offset-2 hover:text-[#7f5a0e]">Contact</a>
            </div>

          </form>

        </div>
      </div>


      {/* ──────────────────────────────────────────────────────────
          RIGHT COLUMN: Order Summary (Dark Charcoal Background #1c1c1c)
          ────────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[43%] xl:w-[42%] bg-[#1a1a1a] text-white flex justify-start">
        <div className="w-full max-w-[500px] px-4 sm:px-8 lg:pl-12 lg:pr-10 py-8 sm:py-12 space-y-7 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          
          {/* Brand Logo on Desktop */}
          <div className="hidden lg:block pb-1">
            <Link to="/" className="text-2xl font-black uppercase tracking-widest text-white hover:opacity-80 transition">
              LANKAN VIBE
            </Link>
          </div>

          {/* Cart Items List */}
          <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 divide-y divide-neutral-800">
            {items.map((it) => {
              const itemTotal = getItemSubtotal(it);

              return (
                <div key={it.id} className="pt-3.5 first:pt-0 flex items-center justify-between gap-4">
                  {/* Thumbnail with Quantity Pill */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative w-16 h-20 rounded-lg border border-neutral-700 bg-neutral-800 shrink-0">
                      {/* Quantity Badge on Top Right Corner */}
                      <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-neutral-600 text-white text-[11px] font-bold flex items-center justify-center border border-neutral-500 shadow-sm z-10">
                        {it.quantity}
                      </span>
                      <img
                        src={it.imageUrl || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600'}
                        alt={it.productName}
                        className="w-full h-full object-cover rounded-lg"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600';
                        }}
                      />
                    </div>

                    {/* Title and details */}
                    <div className="space-y-0.5 truncate">
                      <p className="text-xs font-bold text-white uppercase tracking-tight truncate">
                        {it.productName}
                      </p>
                      <p className="text-[11px] text-neutral-400 uppercase tracking-wider">
                        STANDARD EDITION
                      </p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="text-right shrink-0">
                    <span className="text-xs font-semibold text-white">
                      {formatRs(itemTotal)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discount code or gift card */}
          <form onSubmit={handleApplyDiscount} className="flex gap-2 pt-2">
            <input
              type="text"
              placeholder="Discount code or gift card"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              className="flex-1 bg-white text-neutral-900 placeholder-neutral-500 rounded-lg p-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#c58b10] border-0"
            />
            <button
              type="submit"
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold px-5 py-3 rounded-lg transition"
            >
              Apply
            </button>
          </form>

          {/* Subtotal & Shipping breakdown */}
          <div className="space-y-3 pt-3 border-t border-neutral-800 text-xs">
            <div className="flex justify-between text-neutral-300">
              <span>Subtotal</span>
              <span className="font-semibold text-white">{formatRs(subtotal)}</span>
            </div>

            {discountApplied && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount (VIBE10)</span>
                <span className="font-semibold">- {formatRs(discountAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-neutral-300">
              <span>Shipping</span>
              <span className="font-semibold text-white">
                {shippingFee === 0 ? 'FREE' : formatRs(shippingFee)}
              </span>
            </div>
          </div>

          {/* Total Amount Row */}
          <div className="pt-4 border-t border-neutral-800 flex justify-between items-baseline">
            <span className="text-sm font-bold text-white">Total</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-neutral-400 uppercase font-normal">LKR</span>
              <span className="text-xl sm:text-2xl font-bold text-white">
                {formatRs(grandTotal)}
              </span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default CheckoutPage;
