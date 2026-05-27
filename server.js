require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const customerSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    surname: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    notifications: [
      {
        title: {
          type: String,
          required: true,
          trim: true,
        },
        message: {
          type: String,
          required: true,
          trim: true,
        },
        type: {
          type: String,
          enum: ["ride", "discount", "system"],
          default: "system",
        },
        read: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    discountNotificationSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

customerSchema.methods.toSafeProfile = function toSafeProfile() {
  return {
    id: this._id,
    firstName: this.firstName,
    surname: this.surname,
    email: this.email,
    discountNotificationSent: this.discountNotificationSent,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Customer = mongoose.model("Customer", customerSchema);

const bookingSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    startingLocation: {
      type: String,
      required: true,
      trim: true,
    },
    endingLocation: {
      type: String,
      required: true,
      trim: true,
    },
    bookingDateTime: {
      type: Date,
      required: true,
    },
    passengers: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    cabType: {
      type: String,
      enum: ["Economic", "Premium", "Executive"],
      required: true,
    },
    status: {
      type: String,
      enum: ["confirmed", "cancelled"],
      default: "confirmed",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },
  },
  {
    timestamps: true,
  }
);

bookingSchema.methods.toBookingDetails = function toBookingDetails() {
  return {
    id: this._id,
    customerId: this.customerId,
    startingLocation: this.startingLocation,
    endingLocation: this.endingLocation,
    bookingDateTime: this.bookingDateTime,
    passengers: this.passengers,
    cabType: this.cabType,
    status: this.status,
    paymentStatus: this.paymentStatus,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Booking = mongoose.model("Booking", bookingSchema);

const paymentSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    cabFare: {
      type: Number,
      required: true,
    },
    cabMultiplier: {
      type: Number,
      required: true,
    },
    daytimeMultiplier: {
      type: Number,
      required: true,
    },
    passengersMultiplier: {
      type: Number,
      required: true,
    },
    discountMultiplier: {
      type: Number,
      required: true,
      default: 1,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "EUR",
    },
    fareSource: {
      type: String,
      enum: ["external-api", "demo-fallback"],
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["card", "cash", "wallet"],
      default: "card",
    },
    status: {
      type: String,
      enum: ["successful", "failed"],
      default: "successful",
    },
    auditTrail: [
      {
        action: {
          type: String,
          required: true,
        },
        message: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

paymentSchema.methods.toPaymentDetails = function toPaymentDetails() {
  return {
    id: this._id,
    customerId: this.customerId,
    bookingId: this.bookingId,
    cabFare: this.cabFare,
    cabMultiplier: this.cabMultiplier,
    daytimeMultiplier: this.daytimeMultiplier,
    passengersMultiplier: this.passengersMultiplier,
    discountMultiplier: this.discountMultiplier,
    totalPrice: this.totalPrice,
    currency: this.currency,
    fareSource: this.fareSource,
    paymentMethod: this.paymentMethod,
    status: this.status,
    auditTrail: this.auditTrail,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Payment = mongoose.model("Payment", paymentSchema);

const favouriteLocationSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
      default: "Malta",
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

favouriteLocationSchema.methods.toLocationDetails = function toLocationDetails() {
  return {
    id: this._id,
    customerId: this.customerId,
    label: this.label,
    address: this.address,
    city: this.city,
    country: this.country,
    notes: this.notes,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const FavouriteLocation = mongoose.model("FavouriteLocation", favouriteLocationSchema);

const CAB_MULTIPLIERS = {
  Economic: 1,
  Premium: 1.2,
  Executive: 1.4,
};

function createToken(customer) {
  return jwt.sign(
    {
      customerId: customer._id,
      email: customer.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "2h",
    }
  );
}

async function authenticateCustomer(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication token is required." });
  }

  try {
    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const customer = await Customer.findById(payload.customerId);

    if (!customer) {
      return res.status(401).json({ message: "Customer account no longer exists." });
    }

    req.customer = customer;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired authentication token." });
  }
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getDaytimeMultiplier(bookingDateTime) {
  const hour = bookingDateTime.getHours();
  return hour >= 0 && hour < 8 ? 1.2 : 1;
}

function getPassengersMultiplier(passengers) {
  if (passengers >= 1 && passengers <= 4) {
    return 1;
  }

  if (passengers >= 5 && passengers <= 8) {
    return 2;
  }

  return null;
}

async function getCabFareFromExternalApi(booking) {
  if (!process.env.TAXI_FARE_API_URL || !process.env.RAPIDAPI_KEY) {
    return {
      fare: 15,
      source: "demo-fallback",
    };
  }

  const url = new URL(process.env.TAXI_FARE_API_URL);
  url.searchParams.set("start", booking.startingLocation);
  url.searchParams.set("end", booking.endingLocation);

  const response = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": process.env.RAPIDAPI_HOST || url.hostname,
    },
  });

  if (!response.ok) {
    throw new Error("Taxi fare API request failed.");
  }

  const data = await response.json();
  const fare = Number(data.fare || data.total_fare || data.estimated_fare || data.price);

  if (!Number.isFinite(fare) || fare <= 0) {
    throw new Error("Taxi fare API response did not include a valid fare.");
  }

  return {
    fare,
    source: "external-api",
  };
}

async function customerCanUseDiscount(customerId) {
  const successfulPayments = await Payment.countDocuments({
    customerId,
    status: "successful",
  });

  return successfulPayments >= 3;
}

async function notifyDiscountAvailable(customerId) {
  const successfulPayments = await Payment.countDocuments({
    customerId,
    status: "successful",
  });

  if (successfulPayments < 3) {
    return null;
  }

  const customer = await Customer.findOne({
    _id: customerId,
    discountNotificationSent: { $ne: true },
  });

  if (!customer) {
    return null;
  }

  customer.notifications.push({
    title: "Discount available",
    message: "You have completed three bookings. A discount is now available for your next ride.",
    type: "discount",
  });
  customer.discountNotificationSent = true;

  await customer.save();

  return customer.notifications[customer.notifications.length - 1];
}

function buildLocationQuery(location) {
  return [location.address, location.city, location.country].filter(Boolean).join(", ");
}

function createDemoWeatherForecast(location) {
  return {
    source: "demo-fallback",
    location: buildLocationQuery(location),
    current: {
      condition: "Partly cloudy",
      temperatureC: 22,
      windKph: 14,
      humidity: 65,
    },
    forecast: [
      {
        date: new Date().toISOString().slice(0, 10),
        condition: "Partly cloudy",
        minTempC: 18,
        maxTempC: 24,
        chanceOfRain: 20,
      },
    ],
  };
}

async function getWeatherForecastForLocation(location) {
  if (!process.env.WEATHER_API_URL || !process.env.RAPIDAPI_KEY) {
    return createDemoWeatherForecast(location);
  }

  const url = new URL(process.env.WEATHER_API_URL);
  url.searchParams.set("q", buildLocationQuery(location));
  url.searchParams.set("days", "1");

  const response = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": process.env.WEATHER_RAPIDAPI_HOST || url.hostname,
    },
  });

  if (!response.ok) {
    throw new Error("Weather API request failed.");
  }

  const data = await response.json();
  const forecastDay = data.forecast?.forecastday?.[0];

  return {
    source: "external-api",
    location: data.location?.name || buildLocationQuery(location),
    current: {
      condition: data.current?.condition?.text,
      temperatureC: data.current?.temp_c,
      windKph: data.current?.wind_kph,
      humidity: data.current?.humidity,
    },
    forecast: forecastDay
      ? [
          {
            date: forecastDay.date,
            condition: forecastDay.day?.condition?.text,
            minTempC: forecastDay.day?.mintemp_c,
            maxTempC: forecastDay.day?.maxtemp_c,
            chanceOfRain: forecastDay.day?.daily_chance_of_rain,
          },
        ]
      : [],
  };
}

app.get("/health", (req, res) => {
  res.json({
    service: "customer-service",
    status: "ok",
  });
});

app.post("/api/customers/register", async (req, res) => {
  try {
    const { firstName, surname, email, password } = req.body;

    if (!firstName || !surname || !email || !password) {
      return res.status(400).json({
        message: "First name, surname, email and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long.",
      });
    }

    const existingCustomer = await Customer.findOne({ email });

    if (existingCustomer) {
      return res.status(409).json({
        message: "A customer account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await Customer.create({
      firstName,
      surname,
      email,
      passwordHash,
      notifications: [
        {
          title: "Welcome to Cab Booking Platform",
          message: "Your customer account has been created successfully.",
          type: "system",
        },
      ],
    });

    return res.status(201).json({
      message: "Customer registered successfully.",
      customer: customer.toSafeProfile(),
      token: createToken(customer),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not register customer.",
      error: error.message,
    });
  }
});

app.post("/api/customers/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const customer = await Customer.findOne({ email });

    if (!customer) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, customer.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    return res.json({
      message: "Login successful.",
      customer: customer.toSafeProfile(),
      token: createToken(customer),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not login customer.",
      error: error.message,
    });
  }
});

app.get("/api/customers/me", authenticateCustomer, (req, res) => {
  res.json({
    customer: req.customer.toSafeProfile(),
  });
});

app.get("/api/customers/me/notifications", authenticateCustomer, (req, res) => {
  const notifications = [...req.customer.notifications].sort(
    (a, b) => b.createdAt - a.createdAt
  );

  res.json({
    notifications,
  });
});

app.patch("/api/customers/me/notifications/:notificationId/read", authenticateCustomer, async (req, res) => {
  const notification = req.customer.notifications.id(req.params.notificationId);

  if (!notification) {
    return res.status(404).json({ message: "Notification not found." });
  }

  notification.read = true;
  await req.customer.save();

  return res.json({
    message: "Notification marked as read.",
    notification,
  });
});

app.post("/api/customers/:customerId/notifications", async (req, res) => {
  try {
    const { title, message, type } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        message: "Notification title and message are required.",
      });
    }

    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    customer.notifications.push({
      title,
      message,
      type: type || "system",
    });

    await customer.save();

    return res.status(201).json({
      message: "Notification added successfully.",
      notification: customer.notifications[customer.notifications.length - 1],
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not add notification.",
      error: error.message,
    });
  }
});

app.post("/api/bookings", authenticateCustomer, async (req, res) => {
  try {
    const {
      startingLocation,
      endingLocation,
      bookingDateTime,
      passengers,
      cabType,
    } = req.body;

    if (!startingLocation || !endingLocation || !bookingDateTime || !passengers || !cabType) {
      return res.status(400).json({
        message:
          "Starting location, ending location, date and time, passengers and cab type are required.",
      });
    }

    const parsedDateTime = new Date(bookingDateTime);

    if (Number.isNaN(parsedDateTime.getTime())) {
      return res.status(400).json({
        message: "Booking date and time must be a valid date.",
      });
    }

    const passengerCount = Number(passengers);

    if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 8) {
      return res.status(400).json({
        message: "Passengers must be a whole number between 1 and 8.",
      });
    }

    if (!["Economic", "Premium", "Executive"].includes(cabType)) {
      return res.status(400).json({
        message: "Cab type must be Economic, Premium or Executive.",
      });
    }

    const booking = await Booking.create({
      customerId: req.customer._id,
      startingLocation,
      endingLocation,
      bookingDateTime: parsedDateTime,
      passengers: passengerCount,
      cabType,
    });

    return res.status(201).json({
      message: "Cab booking confirmed successfully.",
      booking: booking.toBookingDetails(),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not create cab booking.",
      error: error.message,
    });
  }
});

app.get("/api/bookings/current", authenticateCustomer, async (req, res) => {
  try {
    const bookings = await Booking.find({
      customerId: req.customer._id,
      bookingDateTime: { $gte: new Date() },
      status: "confirmed",
    }).sort({ bookingDateTime: 1 });

    return res.json({
      bookings: bookings.map((booking) => booking.toBookingDetails()),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not retrieve current cab bookings.",
      error: error.message,
    });
  }
});

app.get("/api/bookings/past", authenticateCustomer, async (req, res) => {
  try {
    const bookings = await Booking.find({
      customerId: req.customer._id,
      bookingDateTime: { $lt: new Date() },
    }).sort({ bookingDateTime: -1 });

    return res.json({
      bookings: bookings.map((booking) => booking.toBookingDetails()),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not retrieve past cab bookings.",
      error: error.message,
    });
  }
});

app.get("/api/bookings/:bookingId", authenticateCustomer, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.bookingId,
      customerId: req.customer._id,
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }

    return res.json({
      booking: booking.toBookingDetails(),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not retrieve cab booking.",
      error: error.message,
    });
  }
});

app.post("/api/payments", authenticateCustomer, async (req, res) => {
  try {
    const { bookingId, paymentMethod, applyDiscount } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        message: "Booking ID is required.",
      });
    }

    if (paymentMethod && !["card", "cash", "wallet"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Payment method must be card, cash or wallet.",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      customerId: req.customer._id,
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found.",
      });
    }

    if (booking.status !== "confirmed") {
      return res.status(400).json({
        message: "Only confirmed bookings can be paid.",
      });
    }

    const existingPayment = await Payment.findOne({
      bookingId: booking._id,
      customerId: req.customer._id,
      status: "successful",
    });

    if (existingPayment) {
      return res.status(409).json({
        message: "This booking has already been paid.",
        payment: existingPayment.toPaymentDetails(),
      });
    }

    const passengersMultiplier = getPassengersMultiplier(booking.passengers);

    if (!passengersMultiplier) {
      return res.status(400).json({
        message: "Bookings with more than 8 passengers are not allowed.",
      });
    }

    const discountAllowed = await customerCanUseDiscount(req.customer._id);

    if (applyDiscount && !discountAllowed) {
      return res.status(400).json({
        message: "Discount is only available after three successful bookings.",
      });
    }

    const fareResult = await getCabFareFromExternalApi(booking);
    const cabMultiplier = CAB_MULTIPLIERS[booking.cabType];
    const daytimeMultiplier = getDaytimeMultiplier(booking.bookingDateTime);
    const discountMultiplier = applyDiscount ? 0.9 : 1;
    const totalPrice = roundMoney(
      fareResult.fare *
        cabMultiplier *
        daytimeMultiplier *
        passengersMultiplier *
        discountMultiplier
    );

    const payment = await Payment.create({
      customerId: req.customer._id,
      bookingId: booking._id,
      cabFare: fareResult.fare,
      cabMultiplier,
      daytimeMultiplier,
      passengersMultiplier,
      discountMultiplier,
      totalPrice,
      fareSource: fareResult.source,
      paymentMethod: paymentMethod || "card",
      auditTrail: [
        {
          action: "fare-calculated",
          message: `Fare calculated using ${fareResult.source}.`,
        },
        {
          action: "payment-successful",
          message: "Payment was processed and stored successfully.",
        },
      ],
    });

    booking.paymentStatus = "paid";
    await booking.save();

    const discountNotification = await notifyDiscountAvailable(req.customer._id);

    return res.status(201).json({
      message: "Payment processed successfully.",
      payment: payment.toPaymentDetails(),
      booking: booking.toBookingDetails(),
      discountNotification,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not process payment.",
      error: error.message,
    });
  }
});

app.get("/api/payments", authenticateCustomer, async (req, res) => {
  try {
    const payments = await Payment.find({
      customerId: req.customer._id,
    }).sort({ createdAt: -1 });

    return res.json({
      payments: payments.map((payment) => payment.toPaymentDetails()),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not retrieve payments.",
      error: error.message,
    });
  }
});

app.get("/api/payments/booking/:bookingId", authenticateCustomer, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      bookingId: req.params.bookingId,
      customerId: req.customer._id,
    }).sort({ createdAt: -1 });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found for this booking.",
      });
    }

    return res.json({
      payment: payment.toPaymentDetails(),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not retrieve payment details.",
      error: error.message,
    });
  }
});

app.get("/api/payments/:paymentId", authenticateCustomer, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      customerId: req.customer._id,
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found.",
      });
    }

    return res.json({
      payment: payment.toPaymentDetails(),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not retrieve payment details.",
      error: error.message,
    });
  }
});

app.post("/api/locations", authenticateCustomer, async (req, res) => {
  try {
    const { label, address, city, country, notes } = req.body;

    if (!label || !address) {
      return res.status(400).json({
        message: "Location label and address are required.",
      });
    }

    const location = await FavouriteLocation.create({
      customerId: req.customer._id,
      label,
      address,
      city,
      country: country || "Malta",
      notes,
    });

    return res.status(201).json({
      message: "Favourite pickup location added successfully.",
      location: location.toLocationDetails(),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not add favourite pickup location.",
      error: error.message,
    });
  }
});

app.get("/api/locations", authenticateCustomer, async (req, res) => {
  try {
    const locations = await FavouriteLocation.find({
      customerId: req.customer._id,
    }).sort({ createdAt: -1 });

    return res.json({
      locations: locations.map((location) => location.toLocationDetails()),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not retrieve favourite pickup locations.",
      error: error.message,
    });
  }
});

app.get("/api/locations/:locationId/weather", authenticateCustomer, async (req, res) => {
  try {
    const location = await FavouriteLocation.findOne({
      _id: req.params.locationId,
      customerId: req.customer._id,
    });

    if (!location) {
      return res.status(404).json({
        message: "Favourite pickup location not found.",
      });
    }

    const weather = await getWeatherForecastForLocation(location);

    return res.json({
      location: location.toLocationDetails(),
      weather,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not retrieve weather forecast.",
      error: error.message,
    });
  }
});

app.get("/api/locations/:locationId", authenticateCustomer, async (req, res) => {
  try {
    const location = await FavouriteLocation.findOne({
      _id: req.params.locationId,
      customerId: req.customer._id,
    });

    if (!location) {
      return res.status(404).json({
        message: "Favourite pickup location not found.",
      });
    }

    return res.json({
      location: location.toLocationDetails(),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not retrieve favourite pickup location.",
      error: error.message,
    });
  }
});

app.put("/api/locations/:locationId", authenticateCustomer, async (req, res) => {
  try {
    const { label, address, city, country, notes } = req.body;
    const location = await FavouriteLocation.findOne({
      _id: req.params.locationId,
      customerId: req.customer._id,
    });

    if (!location) {
      return res.status(404).json({
        message: "Favourite pickup location not found.",
      });
    }

    if (label !== undefined) {
      location.label = label;
    }

    if (address !== undefined) {
      location.address = address;
    }

    if (city !== undefined) {
      location.city = city;
    }

    if (country !== undefined) {
      location.country = country;
    }

    if (notes !== undefined) {
      location.notes = notes;
    }

    if (!location.label || !location.address) {
      return res.status(400).json({
        message: "Location label and address cannot be empty.",
      });
    }

    await location.save();

    return res.json({
      message: "Favourite pickup location updated successfully.",
      location: location.toLocationDetails(),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update favourite pickup location.",
      error: error.message,
    });
  }
});

app.delete("/api/locations/:locationId", authenticateCustomer, async (req, res) => {
  try {
    const location = await FavouriteLocation.findOneAndDelete({
      _id: req.params.locationId,
      customerId: req.customer._id,
    });

    if (!location) {
      return res.status(404).json({
        message: "Favourite pickup location not found.",
      });
    }

    return res.json({
      message: "Favourite pickup location removed successfully.",
      location: location.toLocationDetails(),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not remove favourite pickup location.",
      error: error.message,
    });
  }
});

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Add it to your .env file.");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing. Add it to your .env file.");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  app.listen(PORT, () => {
    console.log(`Cab booking platform services running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start cab booking platform services:", error.message);
  process.exit(1);
});
