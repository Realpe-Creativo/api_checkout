const { Transaccion, OrdenPago, EstadoTransaccion, Usuario } = require('../models');
const { sequelize } = require('../config/database');
const axios = require('axios');
const moment = require('moment'); // Asegúrate de tenerlo instalado o usa new Date().toISOString()

/**
 * Get all transacciones
 * @route GET /transacciones
 */
const getAllTransacciones = async (req, res, next) => {
  try {
    const transacciones = await Transaccion.findAll({
      include: [
        { model: OrdenPago, as: 'ordenPago' },
        { model: EstadoTransaccion, as: 'estadoActual' }
      ]
    });
    res.json(transacciones);
  } catch (error) {
    next(error);
  }
};

/**
 * Get transaccion by ID
 * @route GET /transacciones/:id
 */
const getTransaccionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const transaccion = await Transaccion.findByPk(id, {
      include: [
        { model: OrdenPago, as: 'ordenPago' },
        { model: EstadoTransaccion, as: 'estadoActual' },
        {
          model: EstadoTransaccion,
          as: 'estados',
          order: [['fecha_hora_estado', 'DESC']]
        }
      ]
    });

    if (!transaccion) {
      return res.status(404).json({ message: 'Transacción not found' });
    }

    res.json(transaccion);
  } catch (error) {
    next(error);
  }
};

/**
 * Create new transaccion
 * @route POST /transacciones
 */
const createTransaccion = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const {
      valor_de_pago,
      id_orden_pago,
      estado_inicial,
      document_type,
      document_number,
      name1,
      last_name1,
      email,
      phone,
      cell_phone,
      address,
      state,
      city,
      medio_pago
    } = req.body;

    const ordenPago = await OrdenPago.findByPk(id_orden_pago);
    if (!ordenPago) {
      await t.rollback();
      return res.status(400).json({ message: 'Orden de pago not found' });
    }

    let payment_method_code;
    if (medio_pago === 'PSE') {
      payment_method_code = '1';
    } else if (medio_pago === 'TC/TD') {
      payment_method_code = '2';
    } else {
      await t.rollback();
      return res.status(400).json({ message: 'Medio de pago inválido. Debe ser "PSE" o "TC/TD".' });
    }

    const last = await Transaccion.max('referencia');
    const nextRef = last ? last + 1 : 100000001;
    const valorPasarela = valor_de_pago * 100;

    const transaccion = await Transaccion.create({
      referencia: nextRef,
      valor_de_pago,
      id_orden_pago
    }, { transaction: t });

    const estadoTransaccion = await EstadoTransaccion.create({
      id_transaccion: transaccion.id_transaccion,
      nombre_estado: estado_inicial || 'EN PROCESO',
      fecha_hora_estado: new Date()
    }, { transaction: t });

    await transaccion.update({
      ultimo_estado: estadoTransaccion.id_estado
    }, { transaction: t });

    // ===========================
    // LLAMADA A LA PASARELA
    // ===========================
    const paymentUrl = process.env.PAYMENT_GATEWAY_URL;
    const userApp = process.env.PAYMENT_GATEWAY_USER;
    const passwordApp = process.env.PAYMENT_GATEWAY_PASSWORD;

    const now = moment();
    const transaction_date = now.format('DD/MM/YYYY HH:mm:ss');
    const channel_date = now.clone().add(1, 'days').format('DD/MM/YYYY HH:mm:ss');

    const payload = {
      user_app: userApp,
      password_app: passwordApp,
      commerce_id: "2662",
      user_client: "61067",
      product_id: "1238",
      transaction_date,
      channel_date,
      commerce_url: `${process.env.PAYMENT_RETURN_URL_BASE}?referencia=${nextRef}`,
      ip_client: "191.111.208.165",
      user_agent: req.headers['user-agent'] || "Mozilla/5.0",
      device: "device",
      mac_address: "191.111.208.165",
      locale: "es_CO",
      payment_method_code,
      invoice_number: "",
      currency: "COP",
      thirdPartyInformation: {
        document_type,
        document_number,
        name1,
        last_name1,
        email,
        phone,
        cell_phone,
        address,
        country: "COL",
        state,
        city,
        postal_code: "76001"
      },
      transactionInformation: {
        transaction_id: `${nextRef}`,
        transaction_total: `${valorPasarela}`,
        registry: [
          {
            product_id: "1238",
            detail: `PAGO DEUDA - ${nextRef}`,
            reference01: `${nextRef}`,
            state: "",
            amount: `${valorPasarela}`,
            purchase_amount: `${valorPasarela}`,
            expiration_date: "31/12/2025 09:06:30",
            value_iva: "000",
            identifier: ""
          }
        ]
      },
      subCommerceInformation: {}
    };

    let response;

    console.log('A enviar a la pasarela de pagos:', payload);

    try {
      response = await axios.post(paymentUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('Respuesta pasarela:', response.data);

      if (response.data.response_code !== '0') {
        throw new Error(`Pasarela de pagos rechazó la transacción. Código de respuesta: ${response.data.response_code}, mensaje: ${response.data.response_description || 'Sin mensaje'}`);
      }

    } catch (err) {
      console.error('Error al enviar a pasarela:', err.message);
      // IMPORTANTE: deshacer la transacción si falla la pasarela
      await t.rollback();
      return res.status(500).json({ message: 'Error con la pasarela de pagos', detail: err.message });
    }

    try {
      if (!response.data.url) {
        console.log("LA URL ES NULL", response.data.url)
        throw new Error(`LA PASARELA DE PAGOS NO BRINDA URL VALIDA ${response.data.url}`);
      }
    }
    catch (err) {
      console.error('Error en URL brindada por pasarela de pagos:', response.data.url);
      await t.rollback();
      return res.status(500).json({ message: 'Error con la pasarela de pagos, URL:', detail: response.data.url });
    }

    await t.commit();

    res.status(201).json({
      referencia: nextRef,
      url_pasarela: response.data.url,
      res_cod: response.data.response_code
    });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * Update transaccion state
 * @route PUT /transacciones/:id/estado
 */
const updateTransaccionEstado = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { nombre_estado } = req.body;

    const transaccion = await Transaccion.findByPk(id);
    if (!transaccion) {
      await t.rollback();
      return res.status(404).json({ message: 'Transacción not found' });
    }

    // Create new estado
    const estadoTransaccion = await EstadoTransaccion.create({
      id_transacción: transaccion.ID_transacción,
      nombre_estado,
      fecha_hora_estado: new Date()
    }, { transaction: t });

    // Update transaccion with new estado
    await transaccion.update({
      ultimo_estado: estadoTransaccion.id_estado
    }, { transaction: t });

    await t.commit();

    // Fetch complete transaccion with associations
    const completeTransaccion = await Transaccion.findByPk(transaccion.ID_transacción, {
      include: [
        { model: OrdenPago, as: 'ordenPago' },
        { model: EstadoTransaccion, as: 'estadoActual' }
      ]
    });

    res.json(completeTransaccion);
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * Delete transaccion
 * @route DELETE /transacciones/:id
 */
const deleteTransaccion = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;

    const transaccion = await Transaccion.findByPk(id);
    if (!transaccion) {
      await t.rollback();
      return res.status(404).json({ message: 'Transacción not found' });
    }

    // Delete all related estados
    await EstadoTransaccion.destroy({
      where: { id_transacción: transaccion.ID_transacción },
      transaction: t
    });

    // Delete transaccion
    await transaccion.destroy({ transaction: t });

    await t.commit();

    res.json({ message: 'Transacción deleted successfully' });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * Consultar estado de transacción con FastTrack
 * @route POST /transacciones/consultar-estado
 */

const consultarEstadoTransaccion = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { referencia } = req.body;

    if (!referencia) {
      return res.status(400).json({ message: 'La referencia es obligatoria.' });
    }

    const user_app = process.env.PAYMENT_GATEWAY_USER;
    const password_app = process.env.PAYMENT_GATEWAY_PASSWORD;
    const consultaUrl = process.env.PAYMENT_GATEWAY_STATUS_URL;

    if (!user_app || !password_app || !consultaUrl) {
      return res.status(500).json({ message: 'Error en la construcción de petición Payment' });
    }

    const payload = {
      user_app,
      password_app,
      commerce_id: "2662",
      transaction_id: referencia,
      product_id: "1238"
    };

    const response = await axios.post(consultaUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    const data = response.data;

    if (!data || !data.response_description) {
      return res.status(500).json({ message: 'Respuesta inválida de la pasarela', raw: data });
    }

    const nombre_estado_nuevo = data.state_description;

    const transaccion = await Transaccion.findOne({ where: { referencia } });
    if (!transaccion) {
      return res.status(404).json({ message: 'Transacción no encontrada en la base de datos' });
    }

    const estadoActual = await EstadoTransaccion.findByPk(transaccion.ultimo_estado);

    const ESTADOS_FINALES = ['APROBADO', 'RECHAZADO', 'FALLIDO'];

    // 🔐 Validar si ya está en estado final
    if (estadoActual && ESTADOS_FINALES.includes(estadoActual.nombre_estado.toUpperCase())) {
      return res.status(200).json({
        message: `La transacción ya se encuentra en estado final: ${estadoActual.nombre_estado}.`,
        estado: estadoActual.nombre_estado,
        valor_de_pago: data.transactionInformation.transaction_total
      });
    }

    // Si el estado no ha cambiado, no se actualiza
    if (estadoActual && estadoActual.nombre_estado === nombre_estado_nuevo) {
      return res.status(200).json({
        message: 'Estado consultado correctamente. No hay cambios.',
        estado: nombre_estado_nuevo,
        valor_de_pago: data.transactionInformation.transaction_total
      });
    }

    const nuevoEstado = await EstadoTransaccion.create({
      id_transaccion: transaccion.id_transaccion,
      nombre_estado: nombre_estado_nuevo,
      fecha_hora_estado: new Date(),
      payload_json: JSON.stringify(data)
    }, { transaction: t });

    await transaccion.update({
      ultimo_estado: nuevoEstado.id_estado
    }, { transaction: t });

    if (nombre_estado_nuevo.toUpperCase() === 'APROBADO') {
      await OrdenPago.update(
        { estado: 'PAGADO' },
        { where: { order_id: transaccion.id_orden_pago }, transaction: t }
      );
    }

    await t.commit();

    return res.status(200).json({
      message: 'Estado actualizado correctamente.',
      nuevo_estado: nombre_estado_nuevo,
      valor_de_pago: data.transactionInformation.transaction_total
    });

  } catch (error) {
    await t.rollback();
    console.error('Error al consultar y actualizar estado:', error.message);
    res.status(500).json({
      message: 'Error al consultar o actualizar estado.',
      detail: error.message
    });
  }
};

/**
 * Consultar transacciones por ID de orden de pago (POST)
 * @route POST /transacciones/por-orden
 */
const consultarTransaccionByOrden = async (req, res, next) => {
  try {
    const { order_id } = req.body;

    console.log("OBTIENE EL BODY:", req.body);

    if (!order_id) {
      return res.status(400).json({ message: 'El ID de la orden es obligatorio.' });
    }

    const transacciones = await Transaccion.findAll({
      where: { id_orden_pago: order_id },
      include: [
        { model: EstadoTransaccion, as: 'estadoActual' },
        {
          model: EstadoTransaccion,
          as: 'estados',
          separate: true,
          order: [['fecha_hora_estado', 'DESC']]
        }
      ]
    });

    if (!transacciones || transacciones.length === 0) {
      return res.status(404).json({ message: 'No se encontraron transacciones para esta orden.' });
    }

    return res.json(transacciones);
  } catch (error) {
    next(error);
  }
};

/**
 * Notificación de la pasarela de pagos para actualizar estado de transacción
 * @route POST /transacciones/notificacion_pago
 */
const notificacion_pago = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const data = req.body;

    const { user_app: email, password_app: password } = data;

    // Validar credenciales
    if (!email || !password) {
      return res.status(400).json({
        state_code: "4",
        state_message: "Credenciales no proporcionadas.",
        state_transaction: "false"
      });
    }

    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario) {
      return res.status(400).json({
        state_code: "4",
        state_message: "Usuario no encontrado.",
        state_transaction: "false"
      });
    }

    const passwordValida = await usuario.validPassword(password);
    if (!passwordValida) {
      return res.status(400).json({
        state_code: "4",
        state_message: "Credenciales inválidas.",
        state_transaction: "false"
      });
    }

    // Obtener referencia desde registry[0].reference01
    const referencia = data.transactionInformation?.registry?.[0]?.reference01;

    if (!referencia) {
      return res.status(400).json({
        state_code: "4",
        state_message: "Referencia no proporcionada.",
        state_transaction: "false"
      });
    }

    const nuevoEstadoNombre = data.state_description;
    const codigoEstadoPasarela = data.state_code;
    const invoice_number = referencia;

    const transaccion = await Transaccion.findOne({ where: { referencia } });
    if (!transaccion) {
      return res.status(400).json({
        state_code: "4",
        state_message: "Referencia no encontrada.",
        state_transaction: "false",
        invoice_number
      });
    }

    const estadoActual = await EstadoTransaccion.findByPk(transaccion.ultimo_estado);

    const ESTADOS_FINALES = ['APROBADO', 'RECHAZADO', 'FALLIDO'];

    if (estadoActual && ESTADOS_FINALES.includes(estadoActual.nombre_estado.toUpperCase())) {
      return res.status(200).json({
        state_code: codigoEstadoPasarela,
        state_message: `Transacción ya está en estado final: ${estadoActual.nombre_estado}`,
        state_transaction: "true",
        invoice_number
      });
    }

    if (estadoActual && estadoActual.nombre_estado === nuevoEstadoNombre) {
      return res.status(200).json({
        state_code: codigoEstadoPasarela,
        state_message: "Estado recibido coincide con el actual. No se actualiza.",
        state_transaction: "true",
        invoice_number
      });
    }

    const nuevoEstado = await EstadoTransaccion.create({
      id_transaccion: transaccion.id_transaccion,
      nombre_estado: nuevoEstadoNombre,
      fecha_hora_estado: new Date(),
      payload_json: JSON.stringify(data) // Guardar JSON completo
    }, { transaction: t });

    await transaccion.update({
      ultimo_estado: nuevoEstado.id_estado
    }, { transaction: t });

    if (nuevoEstadoNombre.toUpperCase() === 'APROBADA' || nuevoEstadoNombre.toUpperCase() === 'APROBADO') {
      await OrdenPago.update(
        { estado: 'PAGADO' },
        { where: { order_id: transaccion.id_orden_pago }, transaction: t }
      );
    }

    await t.commit();

    return res.status(200).json({
      state_code: codigoEstadoPasarela,
      state_message: "Transacción actualizada",
      state_transaction: "true",
      invoice_number
    });

  } catch (error) {
    await t.rollback();
    console.error('Error en notificación de pago:', error.message);
    return res.status(400).json({
      state_code: "4",
      state_message: "Error interno en el comercio.",
      state_transaction: "false"
    });
  }
};

module.exports = {
  getAllTransacciones,
  getTransaccionById,
  createTransaccion,
  updateTransaccionEstado,
  deleteTransaccion,
  consultarEstadoTransaccion,
  consultarTransaccionByOrden,
  notificacion_pago
};