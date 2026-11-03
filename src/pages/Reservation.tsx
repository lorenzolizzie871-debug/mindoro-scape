
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IonContent, IonPage, IonSpinner } from '@ionic/react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc, collection, doc, getDoc, serverTimestamp
} from 'firebase/firestore';
import {
  ArrowLeft, CalendarDays, CheckCircle2, CreditCard, Mail, MapPin,
  Minus, Plus, ShieldCheck, Wallet, Check
} from 'lucide-react';
import { auth, db } from '../firebase';
import './ResortDetail.css';
import './Reservation.css';

type ServiceUnit = 'fixed' | 'per_person' | 'per_hour';

type AddOn = {
  id?: string;
  name: string;
  price: number;
  unit?: ServiceUnit | string;
  included?: boolean;
};

type Rate = {
  id?: string;
  unit: string;
  price: number;
  label?: string;
  guestCapacity?: number;
  includedHours?: number;
  durationHours?: number;
  minimumHours?: number;
  includedAmenities?: string[] | string;
  additionalServices?: AddOn[];
};

type ResortDoc = {
  ownerId?: string;
  name?: string;
  resortName?: string;
  resortLocation?: string;
  locationLabel?: string;
  address?: string;
  imageUrl?: string;
  imageUrls?: string[];
  pricingOptions?: Rate[];
  addOns?: AddOn[];
  price?: number;
  priceUnit?: string;
  childFreeUnderAge?: number | null;
  availability?: string;
  status?: string;
};

type SelectedAddOn = {
  id: string;
  name: string;
  price: number;
  unit: ServiceUnit;
  included: boolean;
  quantity: number;
  total: number;
};

const php = (amount: number) =>
  `₱${Math.max(0, amount).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

const localDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const plusDays = (value: string, count: number) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + count);
  return localDate(date);
};

const stayDays = (from: string, to: string) =>
  Math.max(1, Math.round(
    (new Date(`${to}T12:00:00`).getTime() -
      new Date(`${from}T12:00:00`).getTime()) / 86400000
  ));

const unitLabel = (unit: string) => ({
  person: 'per person',
  cottage: 'per cottage',
  hour: 'per hour',
  day: 'per day',
  night: 'per night',
  package: 'per package',
  fixed: 'one-time',
}[unit] || `per ${unit || 'package'}`);

const serviceUnitLabel = (unit?: string) => ({
  fixed: 'One-time fee',
  per_person: 'Per guest',
  per_hour: 'Per hour',
}[unit || 'fixed'] || 'One-time fee');

const makeReference = () =>
  `MND-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const Reservation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const rateIndex = Math.max(0, Number(searchParams.get('rate') || 0));

  const [resort, setResort] = useState<ResortDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [userReady, setUserReady] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [checkIn, setCheckIn] = useState(() => plusDays(localDate(new Date()), 1));
  const [checkOut, setCheckOut] = useState(() => plusDays(localDate(new Date()), 1));

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [childAges, setChildAges] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'paypal' | 'onsite'>('paypal');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successReference, setSuccessReference] = useState('');

  useEffect(() => {
    if (!id) {
      setLoadError('Missing resort listing ID.');
      setLoading(false);
      return;
    }

    let active = true;

    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'packages', decodeURIComponent(id)));

        if (!snap.exists()) {
          throw new Error('This resort listing could not be found.');
        }

        if (active) {
          setResort(snap.data() as ResortDoc);
        }
      } catch (e) {
        if (active) {
          setLoadError(
            e instanceof Error ? e.message : 'Unable to load resort details.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUserReady(true);

      if (!user) {
        setFullName('');
        setEmail('');
        setPhone('');
        return;
      }

      setEmail(user.email || '');
      setFullName(user.displayName || '');

      try {
        const profile = await getDoc(doc(db, 'users', user.uid));

        if (profile.exists()) {
          const data = profile.data();

          if (typeof data.fullName === 'string') {
            setFullName(data.fullName);
          }

          if (typeof data.phone === 'string') {
            setPhone(data.phone);
          }
        }
      } catch (e) {
        console.warn('Could not prefill guest profile', e);
      }
    });

    return unsubscribe;
  }, []);

  const rates = useMemo<Rate[]>(() => {
    if (!resort) return [];

    if (Array.isArray(resort.pricingOptions) && resort.pricingOptions.length) {
      return resort.pricingOptions
        .filter((r) => r && Number.isFinite(Number(r.price)) && Number(r.price) > 0)
        .map((r) => ({ ...r, price: Number(r.price) }));
    }

    return Number(resort.price) > 0
      ? [{ unit: resort.priceUnit || 'package', price: Number(resort.price) }]
      : [];
  }, [resort]);

  const rate = rates[rateIndex] || rates[0];
  const nights = stayDays(checkIn, checkOut);
  const parsedAges = childAges.split(',').map(v => v.trim()).filter(Boolean).map(Number);
  const freeUnder = Number(resort?.childFreeUnderAge || 0);

  const freeChildren = freeUnder > 0
    ? parsedAges.filter(age => Number.isFinite(age) && age >= 0 && age < freeUnder).length
    : 0;

  const chargeableChildren = Math.max(0, children - freeChildren);
  const guestCount = adults + chargeableChildren;

  // Prefer services saved inside the selected pricing option.
  // Older package documents store them at the package's top-level addOns array.
  const availableServices = useMemo<AddOn[]>(() => {
    if (!rate) return [];

    const rateServices = Array.isArray(rate.additionalServices)
      ? rate.additionalServices
      : [];

    const source = rateServices.length > 0
      ? rateServices
      : (Array.isArray(resort?.addOns) ? resort.addOns : []);

    return source
      .filter((service) => service && String(service.name || '').trim())
      .map((service, index) => ({
        ...service,
        id: String(service.id || `service-${index}`),
        name: String(service.name).trim(),
        price: Math.max(0, Number(service.price) || 0),
        unit: (['fixed', 'per_person', 'per_hour'].includes(String(service.unit))
          ? service.unit
          : 'fixed') as ServiceUnit,
        included: Boolean(service.included),
      }));
  }, [rate, resort]);

  // Start with included services selected, plus services the guest selected
  // on the Resort Details page.
  useEffect(() => {
    const routeState = (location.state || {}) as {
      selectedAdditionalServiceIds?: string[];
    };

    const fromDetails = Array.isArray(routeState.selectedAdditionalServiceIds)
      ? routeState.selectedAdditionalServiceIds
      : [];

    const includedIds = availableServices
      .filter(service => service.included)
      .map(service => service.id!);

    const validIds = new Set(availableServices.map(service => service.id));

    setSelectedServiceIds(
      [...new Set([...includedIds, ...fromDetails])]
        .filter(serviceId => validIds.has(serviceId))
    );
  }, [availableServices, location.state]);

  const baseSubtotal = useMemo(() => {
    if (!rate) return 0;

    const unit = rate.unit;

    if (unit === 'person') return rate.price * guestCount;
    if (unit === 'cottage') return rate.price * quantity;

    if (unit === 'hour') {
      return rate.price *
        Math.max(1, Number(rate.durationHours || rate.includedHours || 1)) *
        quantity;
    }

    if (unit === 'day' || unit === 'night') {
      return rate.price * nights * quantity;
    }

    return rate.price * quantity;
  }, [rate, guestCount, quantity, nights]);

  const selectedServices = useMemo<SelectedAddOn[]>(() => {
    return availableServices
      .filter(service => selectedServiceIds.includes(service.id!))
      .map(service => {
        const unit = service.unit as ServiceUnit;

        const multiplier = unit === 'per_person'
          ? guestCount
          : unit === 'per_hour'
            ? Math.max(1, Number(rate?.durationHours || rate?.includedHours || 1)) * quantity
            : 1;

        const total = service.included ? 0 : service.price * multiplier;

        return {
          id: service.id!,
          name: service.name,
          price: service.price,
          unit,
          included: Boolean(service.included),
          quantity: multiplier,
          total,
        };
      });
  }, [availableServices, selectedServiceIds, guestCount, rate, quantity]);

  const addOnTotal = selectedServices.reduce((sum, service) => sum + service.total, 0);
  const total = baseSubtotal + addOnTotal;

  const resortName = resort?.resortName || resort?.name || 'Resort';
  const accommodationName = resort?.name || resortName;
  const resortLocation =
    resort?.locationLabel || resort?.resortLocation || resort?.address || 'Location not provided';
  const image = resort?.imageUrls?.[0] || resort?.imageUrl || '';

  const toggleService = (service: AddOn) => {
    if (!service.id) return;

    setSelectedServiceIds(current =>
      current.includes(service.id!)
        ? current.filter(idValue => idValue !== service.id)
        : [...current, service.id!]
    );
  };

  const changeDate = (value: string) => {
    setCheckIn(value);

    if (checkOut < value) {
      setCheckOut(value);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const user = auth.currentUser;

    if (!user) {
      setError('Please sign in again before making a reservation.');
      return;
    }

    if (!rate) {
      setError('This listing has no valid pricing option. Please contact the resort owner.');
      return;
    }

    if (resort?.availability === 'unavailable' || resort?.status !== 'published') {
      setError('This accommodation is currently unavailable.');
      return;
    }

    if (fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    const today = localDate(new Date());

    if (checkIn < today) {
      setError('Start date cannot be in the past.');
      return;
    }

    if (checkOut < checkIn) {
      setError('End date cannot be earlier than start date.');
      return;
    }

    if (children > 0 && freeUnder > 0 && parsedAges.length !== children) {
      setError(
        `Please enter the age of each child, separated by commas, to apply the under-${freeUnder} free-child policy.`
      );
      return;
    }

    if (parsedAges.some(age => !Number.isInteger(age) || age < 0 || age > 17)) {
      setError('Enter valid child ages from 0 to 17.');
      return;
    }

    setSubmitting(true);

    try {
      const referenceCode = makeReference();

      const reservationPayload = {
        ownerId: resort?.ownerId || '',
        referenceCode,
        userId: user.uid,
        resortId: decodeURIComponent(id),
        resortName,
        accommodationName,
        resortLocation,
        rateIndex,
        rate: {
          id: rate.id || `rate-${rateIndex}`,
          label: rate.label || rate.unit,
          unit: rate.unit,
          price: rate.price,
          durationHours: rate.durationHours || rate.includedHours || null,
          includedAmenities: Array.isArray(rate.includedAmenities)
            ? rate.includedAmenities
            : typeof rate.includedAmenities === 'string'
              ? rate.includedAmenities.split(',').map(item => item.trim()).filter(Boolean)
              : [],
        },
        checkIn,
        checkOut,
        nights,
        adults,
        children,
        childAges: parsedAges,
        freeChildren,
        chargeableChildren,
        guestCount,
        quantity,
        selectedAddOns: selectedServices,
        pricing: {
          baseSubtotal,
          addOnTotal,
          subtotal: baseSubtotal,
          total,
          currency: 'PHP',
        },
        guest: {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
        },
        notes: notes.trim(),
        paymentMethod,

        // A reservation is initially unpaid regardless of payment method.
        // PayPal is marked paid only after backend capture verification.
        // Onsite payment remains unpaid until the owner confirms cash receipt.
        paymentStatus: 'unpaid',

        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const reservationRef = await addDoc(
        collection(db, 'reservations'),
        reservationPayload
      );

      if (paymentMethod === 'paypal') {
        const idToken = await user.getIdToken();

        const response = await fetch(
          'http://localhost:3000/api/paypal/create-order',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ reservationId: reservationRef.id }),
          }
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result.message || 'Unable to create PayPal order.');
        }

        const approvalUrl = result.approvalUrl as string | undefined;

        if (!approvalUrl) {
          throw new Error(
            'PayPal did not return an approval URL. Your reservation is saved as pending and unpaid.'
          );
        }

        const parsedUrl = new URL(approvalUrl);

        if (
          parsedUrl.protocol !== 'https:' ||
          parsedUrl.hostname !== 'www.sandbox.paypal.com'
        ) {
          throw new Error('The PayPal Sandbox checkout URL is invalid.');
        }

        window.location.assign(parsedUrl.toString());
        return;
      }

      // Pay at Resort: request submitted, but payment is still unpaid.
      setSuccessReference(referenceCode);

    } catch (e) {
      console.error('Reservation submission failed:', e);

      setError(
        e instanceof Error
          ? e.message
          : 'We could not complete the reservation. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <IonPage className="rd-page rv-page">
        <IonContent className="rd-content">
          <div className="rd-loading">
            <IonSpinner />
            <p>Loading reservation details…</p>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (loadError || !resort || !rate) {
    return (
      <IonPage className="rd-page rv-page">
        <IonContent className="rd-content">
          <div className="rd-not-found">
            <h2>Reservation unavailable</h2>
            <p>{loadError || 'No pricing option is available for this listing.'}</p>
            <button
              className="rd-primary-button"
              type="button"
              onClick={() => navigate('/user/dashboard')}
            >
              Back to resorts
            </button>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage className="rd-page rv-page">
      <IonContent fullscreen className="rd-content">
        <header className="rd-header">
          <div className="rd-header-left">
            <button
              className="rd-icon-button"
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
            >
              <ArrowLeft size={21} />
            </button>

            <img
              className="rd-logo"
              src="/assets/mindoro-scape-logo.png"
              alt="Mindoro Scape"
            />

            <h1 className="rd-header-title">Reservation</h1>
          </div>
        </header>

        <main className="rv-main">
          <div className="rv-card rv-summary">
            <div className="rv-summary-image">
              {image && <img src={image} alt={resortName} />}
            </div>

            <div className="rv-summary-info">
              <span className="rv-summary-location">
                <MapPin size={14} />
                {resortLocation}
              </span>

              <h2>{resortName}</h2>

              {accommodationName !== resortName && <p>{accommodationName}</p>}

              <strong>{rate.label || `${rate.unit} rate`}</strong>

              <div className="rv-summary-tags">
                <span>{php(rate.price)} {unitLabel(rate.unit)}</span>
              </div>
            </div>
          </div>

          <form onSubmit={submit} noValidate>
            <section className="rv-section">
              <div className="rv-section-heading">
                <h3><CalendarDays size={19} /> Booking Details</h3>
              </div>

              <div className="rv-card rv-stay">
                <div className="rv-field">
                  <label htmlFor="checkin">Start date</label>
                  <input
                    id="checkin"
                    className="rv-date-input"
                    type="date"
                    min={localDate(new Date())}
                    value={checkIn}
                    onChange={e => changeDate(e.target.value)}
                    required
                  />
                </div>

                <div className="rv-field">
                  <label htmlFor="checkout">End date</label>
                  <input
                    id="checkout"
                    className="rv-date-input"
                    type="date"
                    min={checkIn}
                    value={checkOut}
                    onChange={e => setCheckOut(e.target.value)}
                    required
                  />
                </div>

                <p className="rv-hint">
                  Dates are used to estimate the booking duration. The resort owner must confirm actual availability.
                </p>

                <div className="rv-steppers">
                  <div className="rv-stepper-row">
                    <div className="rv-stepper-label">
                      <strong>Adults</strong>
                      <span>Ages 18 and above</span>
                    </div>

                    <div className="rv-stepper">
                      <button
                        type="button"
                        className="rv-step minus"
                        disabled={adults <= 1}
                        onClick={() => setAdults(v => Math.max(1, v - 1))}
                      >
                        <Minus size={16} />
                      </button>

                      <span className="rv-count">{adults}</span>

                      <button
                        type="button"
                        className="rv-step plus"
                        onClick={() => setAdults(v => Math.min(30, v + 1))}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="rv-stepper-row">
                    <div className="rv-stepper-label">
                      <strong>Children</strong>
                      <span>Ages 0–17</span>
                    </div>

                    <div className="rv-stepper">
                      <button
                        type="button"
                        className="rv-step minus"
                        disabled={children <= 0}
                        onClick={() => {
                          setChildren(v => Math.max(0, v - 1));
                          setChildAges('');
                        }}
                      >
                        <Minus size={16} />
                      </button>

                      <span className="rv-count">{children}</span>

                      <button
                        type="button"
                        className="rv-step plus"
                        onClick={() => setChildren(v => Math.min(20, v + 1))}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="rv-stepper-row">
                    <div className="rv-stepper-label">
                      <strong>
                        {rate.unit === 'cottage'
                          ? 'Cottages'
                          : rate.unit === 'hour'
                            ? 'Bookings'
                            : 'Units'}
                      </strong>
                      <span>Quantity for this rate</span>
                    </div>

                    <div className="rv-stepper">
                      <button
                        type="button"
                        className="rv-step minus"
                        disabled={quantity <= 1}
                        onClick={() => setQuantity(v => Math.max(1, v - 1))}
                      >
                        <Minus size={16} />
                      </button>

                      <span className="rv-count">{quantity}</span>

                      <button
                        type="button"
                        className="rv-step plus"
                        onClick={() => setQuantity(v => Math.min(20, v + 1))}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {children > 0 && freeUnder > 0 && (
                  <div className="rv-field">
                    <label htmlFor="childages">Children's ages (comma-separated)</label>

                    <input
                      id="childages"
                      className="rv-text-input"
                      value={childAges}
                      onChange={e => setChildAges(e.target.value)}
                      placeholder="e.g. 2, 5"
                    />

                    <span className="rv-hint">
                      Children under {freeUnder} years old are free. {freeChildren} currently qualify based on the ages entered.
                    </span>
                  </div>
                )}

                {rate.unit === 'hour' && (
                  <p className="rv-hint">
                    Hourly rate duration: {rate.durationHours || rate.includedHours || 1} hour(s). Confirm extra hours directly with the resort.
                  </p>
                )}
              </div>
            </section>

            <section className="rv-section">
              <div className="rv-section-heading">
                <h3>Additional Services</h3>
                <span className="rv-hint">Tap a service to add or remove it.</span>
              </div>

              <div className="rv-card rv-form">
                {availableServices.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {availableServices.map(service => {
                      const selected = selectedServiceIds.includes(service.id!);

                      const multiplier = service.unit === 'per_person'
                        ? guestCount
                        : service.unit === 'per_hour'
                          ? Math.max(1, Number(rate.durationHours || rate.includedHours || 1)) * quantity
                          : 1;

                      const serviceTotal = service.included ? 0 : service.price * multiplier;

                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => toggleService(service)}
                          aria-pressed={selected}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 14,
                            padding: '15px 16px',
                            borderRadius: 13,
                            border: selected ? '2px solid #ef9418' : '1px solid #e5e7eb',
                            background: selected ? '#fff7e9' : '#fff',
                            color: '#242424',
                            textAlign: 'left',
                            cursor: 'pointer',
                            boxShadow: selected ? '0 0 0 2px rgba(239,148,24,.08)' : 'none',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <span
                              style={{
                                width: 23,
                                height: 23,
                                flex: '0 0 23px',
                                display: 'grid',
                                placeItems: 'center',
                                borderRadius: 7,
                                border: selected ? '1px solid #ef9418' : '1px solid #cbd5e1',
                                background: selected ? '#ef9418' : '#fff',
                                color: '#fff',
                              }}
                            >
                              {selected && <Check size={15} />}
                            </span>

                            <span style={{ display: 'grid', gap: 4 }}>
                              <strong>{service.name}</strong>
                              <small style={{ color: '#687386' }}>
                                {service.included
                                  ? 'Included · Free (tap to remove)'
                                  : serviceUnitLabel(service.unit)}
                                {!service.included && service.unit === 'per_person'
                                  ? ` · ${guestCount} guest(s)`
                                  : ''}
                                {!service.included && service.unit === 'per_hour'
                                  ? ` · ${multiplier} billable hour(s)`
                                  : ''}
                              </small>
                            </span>
                          </span>

                          <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: service.included ? '#16834a' : '#242424' }}>
                              {service.included ? 'FREE' : php(serviceTotal)}
                            </strong>

                            {!service.included && service.unit !== 'fixed' && (
                              <small style={{ display: 'block', color: '#687386' }}>
                                {php(service.price)} base rate
                              </small>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rv-hint">
                    No additional services are available for this accommodation.
                  </p>
                )}

                <p className="rv-hint" style={{ marginTop: 12 }}>
                  Included services are free. Optional services are added to your total only when selected.
                </p>
              </div>
            </section>

            <section className="rv-section">
              <div className="rv-section-heading">
                <h3><Mail size={19} /> Primary Guest</h3>
              </div>

              <div className="rv-card rv-form">
                <div className="rv-field">
                  <label htmlFor="guestname">Full name *</label>
                  <input
                    className="rv-text-input"
                    id="guestname"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                  />
                </div>

                <div className="rv-field">
                  <label htmlFor="guestemail">Email address *</label>
                  <input
                    className="rv-text-input"
                    id="guestemail"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="rv-field">
                  <label htmlFor="guestphone">Mobile number</label>
                  <input
                    className="rv-text-input"
                    id="guestphone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+63 9XX XXX XXXX"
                  />
                </div>

                <div className="rv-field">
                  <label htmlFor="guestnotes">Special requests (optional)</label>
                  <textarea
                    id="guestnotes"
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add requests or questions for the resort…"
                  />
                </div>
              </div>
            </section>

            <section className="rv-section">
              <div className="rv-section-heading">
                <h3><CreditCard size={19} /> Payment</h3>
              </div>

              <div className="rv-card rv-form">
                <label className={`rv-payment-option ${paymentMethod === 'paypal' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'paypal'}
                    onChange={() => setPaymentMethod('paypal')}
                  />

                  <CreditCard size={20} />

                  <span>
                    <strong>Pay online with PayPal</strong>
                    <small>Continue to PayPal's secure Sandbox checkout.</small>
                  </span>
                </label>

                <label className={`rv-payment-option ${paymentMethod === 'onsite' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'onsite'}
                    onChange={() => setPaymentMethod('onsite')}
                  />

                  <Wallet size={20} />

                  <span>
                    <strong>Pay at the resort</strong>
                    <small>
                      Submit a reservation request. Payment remains unpaid until the resort owner confirms your cash payment.
                    </small>
                  </span>
                </label>
              </div>
            </section>

            <section className="rv-section">
              <div className="rv-section-heading">
                <h3>Price summary</h3>
              </div>

              <div className="rv-card rv-fare">
                <div className="rv-fare-row">
                  <span>
                    {rate.label || `${rate.unit} rate`} × {rate.unit === 'person'
                      ? guestCount
                      : rate.unit === 'night' || rate.unit === 'day'
                        ? nights
                        : quantity}
                  </span>

                  <strong>{php(baseSubtotal)}</strong>
                </div>

                {freeUnder > 0 && children > 0 && (
                  <div className="rv-fare-row">
                    <span>Free children (under {freeUnder})</span>
                    <strong>{freeChildren}</strong>
                  </div>
                )}

                {selectedServices.map(service => (
                  <div className="rv-fare-row" key={service.id}>
                    <span>{service.name}{service.included ? ' (included)' : ''}</span>
                    <strong>{service.included ? 'FREE' : php(service.total)}</strong>
                  </div>
                ))}

                <div className="rv-fare-row">
                  <span>Additional services subtotal</span>
                  <strong>{php(addOnTotal)}</strong>
                </div>

                <hr />

                <div className="rv-total">
                  <div>
                    <strong>Estimated total</strong>
                    <small>Final amount subject to resort confirmation</small>
                  </div>

                  <span>{php(total)}</span>
                </div>

                <div className="rv-notice">
                  <ShieldCheck size={19} />

                  <p>
                    {paymentMethod === 'paypal'
                      ? 'Your reservation is pending until the resort confirms availability. PayPal payment will only be marked as paid after the backend verifies the completed transaction.'
                      : 'Your reservation request is pending. Payment is still unpaid and will only be marked as paid after the resort owner confirms that cash payment has been received.'}
                  </p>
                </div>
              </div>
            </section>

            {error && (
              <div className="rv-submit-error" role="alert">
                {error}
              </div>
            )}

            <button
              className="rv-submit-button"
              type="submit"
              disabled={submitting || !userReady}
            >
              {submitting
                ? 'Processing…'
                : paymentMethod === 'paypal'
                  ? 'Continue to PayPal Checkout'
                  : 'Submit Reservation Request'}
            </button>

            <div className="rv-secure">
              <ShieldCheck size={14} /> Secure reservation request
            </div>
          </form>
        </main>
      </IonContent>

      {successReference && (
        <div className="rv-success-overlay">
          <div className="rv-success-card">
            <CheckCircle2 size={44} />

            <h2>Reservation request sent!</h2>

            <p>
              Your reference code is <strong>{successReference}</strong>.
              The resort must confirm your dates. Your payment is still unpaid
              until the resort owner confirms receipt of your cash payment.
            </p>

            <button
              className="rv-submit-button"
              onClick={() => navigate('/feature/reservations')}
            >
              View My Bookings
            </button>

            <button
              className="rv-secondary-button"
              onClick={() => navigate('/user/dashboard')}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      )}
    </IonPage>
  );
};

export default Reservation;
