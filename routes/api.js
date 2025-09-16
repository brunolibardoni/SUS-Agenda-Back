
import express from 'express';
const router = express.Router();

import { authenticateUser } from '../config/authMiddleware.js';

import cityController from '../controllers/cityController.js';
import healthPostController from '../controllers/healthPostController.js';
import serviceController from '../controllers/serviceController.js';
import scheduleTemplateController from '../controllers/scheduleTemplateController.js';
import bookingController from '../controllers/bookingController.js';
import contactController from '../controllers/contactController.js';
import userController from '../controllers/userController.js';
import externalController from '../controllers/externalController.js';
import notificationController from '../controllers/notificationController.js';
import { getAvailableSlots } from '../controllers/availableSlotsController.js';

import { login, logout, getCurrentUser } from '../controllers/sessionController.js';
import { getCurrentUserAuth, refreshToken } from '../controllers/authController.js';
import { generateToken } from '../server.js';
import passport from '../config/passport.js';

// Google OAuth routes
router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    try {
      // Generate JWT token for the authenticated user
      const token = generateToken(req.user);

      // Set JWT token in cookie for client-side storage
      res.cookie('jwtToken', token, {
        httpOnly: false, // Allow client-side access
        secure: true, // Always HTTPS in production
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'none' // Required for cross-site requests
      });

      // Check if user needs profile completion
      if (req.user && req.user.needsProfileCompletion) {
        // Redirect to frontend with flag indicating profile completion needed
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?needsProfileCompletion=true&token=${token}`);
      } else {
        // Successful authentication, redirect to frontend
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?token=${token}`);
      }
    } catch (error) {
      console.error('Error in OAuth callback:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?error=oauth_failed`);
    }
  }
);

// Get current user session or JWT token
router.get('/auth/me', getCurrentUserAuth);

// Refresh JWT token
router.post('/auth/refresh', refreshToken);

// Autenticação
router.post('/login', login);
router.post('/logout', logout);
router.post('/register', userController.register);

// Rotas de Cidades
router.get('/cities', cityController.getAllCities);
router.get('/cities/admin', cityController.getAllCitiesAdmin);
router.post('/cities', cityController.createCity);
router.put('/cities/:id', cityController.updateCity);
router.delete('/cities/:id', cityController.deleteCity);

// Rotas de Postos de Saúde
router.get('/cities/:cityId/health-posts', healthPostController.getHealthPostsByCity);
router.post('/health-posts', healthPostController.createHealthPost);
router.put('/health-posts/:id', healthPostController.updateHealthPost);
router.delete('/health-posts/:id', healthPostController.deleteHealthPost);

// Rotas de Serviços
router.get('/cities/:cityId/services', serviceController.getServicesByCity);
router.post('/services', serviceController.createService);
router.put('/services/:id', serviceController.updateService);
router.delete('/services/:id', serviceController.deleteService);

// Rotas de Modelos de Horário
router.get('/cities/:cityId/schedule-templates', scheduleTemplateController.getTemplatesByCity);
router.post('/schedule-templates', scheduleTemplateController.createTemplate);
router.put('/schedule-templates/:id', scheduleTemplateController.updateTemplate);
router.delete('/schedule-templates/:id', scheduleTemplateController.deleteTemplate);

// Rotas de Agendamentos
router.get('/cities/:cityId/bookings', bookingController.getBookingsByCity);
router.put('/bookings/:id/status', bookingController.updateBookingStatus);

// Rota para buscar horários disponíveis
router.get('/available-slots', getAvailableSlots);
router.put('/bookings/:id/comment', bookingController.updateBookingComment);

// Rotas de Informações de Contato
router.get('/cities/:cityId/contact', contactController.getContactByCity);
router.post('/contact', contactController.createContact);
router.put('/contact/:id', contactController.updateContact);

// Rotas de Usuários
router.put('/users/:userId/password', userController.updatePassword);
router.put('/users/complete-profile', authenticateUser, userController.completeProfile);
router.get('/users/:userId/notifications', userController.getUserNotifications);
router.put('/notifications/:notificationId/read', userController.markNotificationAsRead);
router.put('/users/:userId/notifications/read-all', userController.markAllNotificationsAsRead);
router.delete('/notifications/:notificationId', userController.deleteNotification);

// Rota para criar notificação
router.post('/notifications', notificationController.createNotification);

// Rotas do Portal Externo
router.post('/external/bookings', externalController.createBooking);
router.get('/external/users/:userId/bookings', externalController.getUserBookings);
router.put('/external/bookings/:bookingId/cancel', externalController.cancelBooking);

export default router;
