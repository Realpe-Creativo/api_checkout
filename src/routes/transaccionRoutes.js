const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middlewares/validator');
const { authenticateToken, authorizeRole } = require('../middlewares/auth');
const transaccionController = require('../controllers/transaccionController');
const estadoTransaccionController = require('../controllers/estadoTransaccionController');

const router = express.Router();

/**
 * @route POST /transacciones
 * @desc Create a new transaccion
 * @access Private
 */
router.post('/',
  [
    (req, res, next) => {
      console.log('Body recibido:', req.body);
      next();
    },
    body('valor_de_pago').isFloat({ min: 0 }).withMessage('Valor de pago must be a positive number'),
    body('id_orden_pago').isInt().withMessage('ID orden pago must be an integer'),
    body('estado_inicial').optional().notEmpty().withMessage('Estado inicial cannot be empty'),
    validate
  ],
  transaccionController.createTransaccion
);

router.post('/consultar-estado', transaccionController.consultarEstadoTransaccion);

router.post('/notificacion_pago', transaccionController.notificacion_pago);

// Protect all routes
router.use(authenticateToken);

/**
 * @route GET /transacciones
 * @desc Get all transacciones
 * @access Private
 */
router.get('/', authorizeRole(['ADMIN', 'USER']), transaccionController.getAllTransacciones);

/**
 * @route GET /transacciones/:id
 * @desc Get transaccion by ID
 * @access Private
 */
router.get('/:id', [
  param('id').isInt().withMessage('ID must be an integer'),
  validate
], authorizeRole(['ADMIN', 'USER']), transaccionController.getTransaccionById);

/**
 * @route GET /transacciones/:id/estados
 * @desc Get estados by transaccion ID
 * @access Private
 */
router.get('/:id/estados', [
  param('id').isInt().withMessage('ID must be an integer'),
  validate
], authorizeRole(['ADMIN', 'USER']), estadoTransaccionController.getEstadosByTransaccionId);

/**
 * @route PUT /transacciones/:id/estado
 * @desc Update transaccion state
 * @access Private
 */
router.put('/:id/estado', [
  param('id').isInt().withMessage('ID must be an integer'),
  body('nombre_estado').notEmpty().withMessage('Nombre estado is required'),
  validate
], authorizeRole(['ADMIN', 'USER']), transaccionController.updateTransaccionEstado);

/**
 * @route DELETE /transacciones/:id
 * @desc Delete a transaccion
 * @access Private
 */
router.delete('/:id', [
  param('id').isInt().withMessage('ID must be an integer'),
  validate
], authorizeRole(['ADMIN']), transaccionController.deleteTransaccion);

router.post('/byOrder', [
  (req, res, next) => {
      console.log('Body recibido:', req.body);
      next();
    },
  body('order_id').isInt().withMessage('El ID de la orden debe ser un número entero'),
  validate
], authorizeRole(['ADMIN', 'USER']), transaccionController.consultarTransaccionByOrden);

module.exports = router;