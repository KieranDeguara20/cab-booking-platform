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

// Other microservices can call this endpoint to add ride or discount messages.
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

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Add it to your .env file.");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing. Add it to your .env file.");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  app.listen(PORT, () => {
    console.log(`Customer microservice running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start customer microservice:", error.message);
  process.exit(1);
});
