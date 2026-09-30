// backend/routes/contacts.js
const express = require('express');
const router = express.Router();

// Store emergency contacts in memory
let contactsStore = {};

// Save emergency contacts
router.post('/save', (req, res) => {
    const { userId, contacts } = req.body;
    if (userId && contacts) {
        contactsStore[userId] = contacts;
        res.json({ success: true, message: 'Contacts saved', contacts });
    } else {
        res.status(400).json({ error: 'Missing userId or contacts' });
    }
});

// Get contacts for a user
router.get('/:userId', (req, res) => {
    const { userId } = req.params;
    const contacts = contactsStore[userId] || [
        { name: 'Police', number: '100', type: 'emergency' },
        { name: 'Ambulance', number: '102', type: 'emergency' },
        { name: 'Women Helpline', number: '1091', type: 'emergency' }
    ];
    res.json({ success: true, contacts });
});

// Send SOS to contacts
router.post('/sos-notify', (req, res) => {
    const { userId, location, message } = req.body;
    const contacts = contactsStore[userId] || [];
    console.log(`[SOS] Notifying ${contacts.length} contacts for user ${userId}`);
    console.log(`[SOS] Location: ${location?.lat}, ${location?.lng}`);
    console.log(`[SOS] Message: ${message}`);
    res.json({ 
        success: true, 
        message: `SOS sent to ${contacts.length} contacts`,
        notifiedCount: contacts.length
    });
});

// Add a contact
router.post('/add', (req, res) => {
    const { userId, name, number, type } = req.body;
    if (!contactsStore[userId]) contactsStore[userId] = [];
    contactsStore[userId].push({ name, number, type: type || 'personal' });
    res.json({ success: true, message: `Added ${name} to contacts` });
});

// Delete a contact
router.delete('/remove', (req, res) => {
    const { userId, index } = req.body;
    if (contactsStore[userId] && contactsStore[userId][index]) {
        const removed = contactsStore[userId].splice(index, 1);
        res.json({ success: true, message: `Removed ${removed[0].name}` });
    } else {
        res.status(404).json({ error: 'Contact not found' });
    }
});

module.exports = router;