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
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Booking = mongoose.model("Booking", bookingSchema);

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