const express = require("express");
const router = express.Router();

// mongodb user model
const User = require("./../models/User");

// mongodb user verification model
const UserVerification = require("./../models/UserVerification");

// email handler
const nodemailer = require("nodemailer");

// unique string
const { v4: uuidv4 } = require("uuid");

// Password handler
const bcrypt = require("bcrypt");

// Env variables
require("dotenv").config();

// path for static verified page
const path = require("path");

// Nodemailer stuff
const myEmail = "tothepointcode@gmail.com";

let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: "tothepointcode@gmail.com",
    clientId: process.env.AUTH_CLIENT_ID,
    clientSecret: process.env.AUTH_CLIENT_SECRET,
    refreshToken: process.env.AUTH_REFRESH_TOKEN,
  },
});

// testing success
transporter.verify((error, success) => {
  if (error) {
    console.log(error);
  } else {
    console.log("Ready for messages");
    console.log(success);
  }
});

// Signup
router.post("/signup", (req, res) => {
  let { name, email, password, dateOfBirth } = req.body;
  name = name.trim();
  email = email.trim();
  password = password.trim();
  dateOfBirth = dateOfBirth.trim();

  if (name == "" || email == "" || password == "" || dateOfBirth == "") {
    res.json({
      status: "FAILED",
      message: "Empty input fields!",
    });
  } else if (!/^[a-zA-Z ]*$/.test(name)) {
    res.json({
      status: "FAILED",
      message: "Invalid name entered",
    });
  } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
    res.json({
      status: "FAILED",
      message: "Invalid email entered",
    });
  } else if (!new Date(dateOfBirth).getTime()) {
    res.json({
      status: "FAILED",
      message: "Invalid date of birth entered",
    });
  } else if (password.length < 8) {
    res.json({
      status: "FAILED",
      message: "Password is too short!",
    });
  } else {
    // Checking if user already exists
    User.find({ email })
      .then((result) => {
        if (result.length) {
          // A user already exists
          res.json({
            status: "FAILED",
            message: "User with the provided email already exists",
          });
        } else {
          // Try to create new user

          // password handling
          const saltRounds = 10;
          bcrypt
            .hash(password, saltRounds)
            .then((hashedPassword) => {
              const newUser = new User({
                name,
                email,
                password: hashedPassword,
                dateOfBirth,
                verified: false,
              });

              newUser
                .save()
                .then((result) => {
                  // Handle account verification
                  sendVerificationEmail(result, res);
                })
                .catch((err) => {
                  console.log(err);
                  res.json({
                    status: "FAILED",
                    message: "An error occurred while saving user account!",
                  });
                });
            })
            .catch((err) => {
              res.json({
                status: "FAILED",
                message: "An error occurred while hashing password!",
              });
            });
        }
      })
      .catch((err) => {
        console.log(err);
        res.json({
          status: "FAILED",
          message: "An error occurred while checking for existing user!",
        });
      });
  }
});

// send verification email
const sendVerificationEmail = ({ _id, email }, res) => {
  // url to be used in the email.
  const currentUrl = "http://localhost:5000/";

  const uniqueString = uuidv4() + _id;

  // mail options
  const mailOptions = {
    from: myEmail,
    to: email,
    subject: "Verify Your Email",
    html: `<p> Verify your email address to complete the signup and login into your account. This link <b>expires in 6 hours</b>. Press <a href=${
      currentUrl + "user/verify/" + _id + "/" + uniqueString
    }>here</a> to proceed.</p>`,
  };

  // hash the uniqueString
  const saltRounds = 10;
  bcrypt
    .hash(uniqueString, saltRounds)
    .then((hashedUniqueString) => {
      // set values in userVerification collection
      const newVerification = new UserVerification({
        userId: _id,
        uniqueString: hashedUniqueString,
        createdAt: Date.now(),
        expiresAt: Date.now() + 21600000,
      });

      newVerification
        .save()
        .then(() => {
          transporter
            .sendMail(mailOptions)
            .then(() => {
              // email sent and verification record saved.
              res.json({
                status: "PENDING",
                message: "Verification email sent",
              });
            })
            .catch((err) => {
              res.json({
                status: "FAILED",
                message: "Verification email failed",
              });
              console.log(err);
            });
        })
        .catch((error) => {
          console.log(error);
          res.json({
            status: "FAILED",
            message: "Couldn't save verification email data",
          });
        });
    })
    .catch(() => {
      res.json({
        status: "FAILED",
        message: "An error occurred while hashing email data!",
      });
    });
};

// Verify email
router.get("/verify/:userId/:uniqueString", (req, res) => {
  let { userId, uniqueString } = req.params;

  UserVerification.find({ userId })
    .then((result) => {
      if (result.length > 0) {
        // user verification record exists so we proceed

        const { expiresAt } = result[0];
        const hashedUniqueString = result[0].uniqueString;

        // checking for expired unique string
        if (expiresAt < Date.now()) {
          UserVerification.deleteOne({ userId })
            .then((result) => {
              // delete expired user
              User.deleteOne({ userId })
                .then(() => {
                  // res.json({
                  //   status: "FAILED",
                  //   message: "Link has expired. Please sign up again.",
                  // });
                  let message = "Link has expired. Please sign up again.";
                  res.redirect(`/user/verified?error=true&message=${message}`);
                })
                .catch((error) => {
                  console.log(error);
                  // res.json({
                  //   status: "FAILED",
                  //   message: "Clearing user with expired unique string failed.",
                  // });
                  let message =
                    "Clearing user with expired unique string failed.";
                  res.redirect(`/user/verified?error=true&message=${message}`);
                });
            })
            .catch((error) => {
              // deletion failed
              console.log(error);
              // res.json({
              //   status: "FAILED",
              //   message:
              //     "An error occurred while clearing expired user verification record",
              // });
              let message =
                "An error occurred while clearing expired user verification record";
              res.redirect(`/user/verified?error=true&message=${message}`);
            });
        } else {
          // valid record exists so we validate the user string
          // First compare the hashed unique string

          bcrypt
            .compare(uniqueString, hashedUniqueString)
            .then((result) => {
              if (result) {
                // Strings match

                User.updateOne({ _id: userId }, { verified: true })
                  .then(() => {
                    UserVerification.deleteOne({ userId })
                      .then(() => {
                        // res.json({
                        //   status: "VERIFIED",
                        //   message: "Email is verified. You can now login",
                        // });
                        res.sendFile(
                          path.join(__dirname, "./../views/verified.html")
                        );
                      })
                      .catch((error) => {
                        console.log(error);
                        // res.json({
                        //   status: "FAILED",
                        //   message:
                        //     "An error occurred while finalizing successful verification.",
                        // });
                        
                        let message =
                          "An error occurred while finalizing successful verification.";
                        res.redirect(
                          `/user/verified?error=true&message=${message}`
                        );
                      });
                  })
                  .catch((error) => {
                    console.log(error);
                    // res.json({
                    //   status: "FAILED",
                    //   message:
                    //     "An error occurred while updating user record to show verified.",
                    // });
                    let message =
                      "An error occurred while updating user record to show verified.";
                    res.redirect(
                      `/user/verified?error=true&message=${message}`
                    );
                  });
              } else {
                // Existing record but incorrect verification details passed.

                // res.json({
                //   status: "FAILED",
                //   message: "Invalid verification details passed. Check your inbox.",
                // });
                let message =
                  "Invalid verification details passed. Check your inbox.";
                res.redirect(`/user/verified?error=true&message=${message}`);
              }
            })
            .catch((err) => {
              // res.json({
              //   status: "FAILED",
              //   message: "An error occurred while comparing unique strings",
              // });
              let message = "An error occurred while comparing unique strings.";
              res.redirect(`/user/verified?error=true&message=${message}`);
            });
        }
      } else {
        // user verification record doesn't exist
        // res.json({
        //   status: "FAILED",
        //   message:
        //     "Account record doesn't exist or has been verified already. Please sign up or log in.",
        // });
        let message =
          "Account record doesn't exist or has been verified already. Please sign up or log in.";
        res.redirect(`/user/verified?error=true&message=${message}`);
      }
    })
    .catch((error) => {
      console.log(error);
      // res.json({
      //   status: "FAILED",
      //   message:
      //     "An error occurred while checking for existing user verification record",
      // });
      let message =
        "An error occurred while checking for existing user verification record";
      res.redirect(`/user/verified?error=true&message=${message}`);
    });
});

// Verified page route
router.get("/verified", (_, res) => {
  res.sendFile(path.join(__dirname, `./../views/verified.html`));
});

// Signin
router.post("/signin", (req, res) => {
  let { email, password } = req.body;
  email = email.trim();
  password = password.trim();

  if (email == "" || password == "") {
    res.json({
      status: "FAILED",
      message: "Empty credentials supplied",
    });
  } else {
    // Check if user exist
    User.find({ email })
      .then((data) => {
        if (data.length) {
          // User exists

          // check if user is verified

          if (!data[0].verified) {
            res.json({
              status: "FAILED",
              message: "Email hasn't been verified yet. Check your inbox.",
            });
          } else {
            // email is verified so we check password

            const hashedPassword = data[0].password;
            bcrypt
              .compare(password, hashedPassword)
              .then((result) => {
                if (result) {
                  // Password match
                  res.json({
                    status: "SUCCESS",
                    message: "Signin successful",
                    data: data,
                  });
                } else {
                  res.json({
                    status: "FAILED",
                    message: "Invalid password entered!",
                  });
                }
              })
              .catch((err) => {
                res.json({
                  status: "FAILED",
                  message: "An error occurred while comparing passwords",
                });
              });
          }
        } else {
          res.json({
            status: "FAILED",
            message: "Invalid credentials entered!",
          });
        }
      })
      .catch((err) => {
        res.json({
          status: "FAILED",
          message: "An error occurred while checking for existing user",
        });
      });
  }
});

module.exports = router;
