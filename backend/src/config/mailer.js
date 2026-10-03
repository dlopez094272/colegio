const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
});

async function sendMail({ to, subject, html, attachments }) {
  return transporter.sendMail({
    from:    process.env.SMTP_FROM,
    to, subject, html, attachments,
  });
}

module.exports = { sendMail };
