const { OrdenPago, Cliente, Usuario, OrdenCargue, Transaccion, EstadoTransaccion } = require('../models');
const { Op } = require('sequelize');
/**
 * Get all ordenes de pago
 * @route GET /ordenes-pago
 */
const getAllOrdenesPago = async (req, res, next) => {
  try {
    const ordenesPago = await OrdenPago.findAll({
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'usuarioCreador' },
        { model: OrdenCargue, as: 'ordenCargue' }
      ]
    });
    res.json(ordenesPago);
  } catch (error) {
    next(error);
  }
};

/**
 * Get orden de pago by ID
 * @route GET /ordenes-pago/:id
 */
const getOrdenPagoById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ordenPago = await OrdenPago.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'usuarioCreador' },
        { model: OrdenCargue, as: 'ordenCargue' }
      ]
    });

    if (!ordenPago) {
      return res.status(404).json({ message: 'Orden de pago not found' });
    }

    res.json(ordenPago);
  } catch (error) {
    next(error);
  }
};

/**
 * Create new orden de pago
 * @route POST /ordenes-pago
 */
const createOrdenPago = async (req, res, next) => {
  try {

    const {
      cliente_id,
      tipo_identificacion,
      nombre_cliente,
      fecha_creacion,
      ultimo_intento_pago,
      forma_cargue,
      orden_cargue_archivo,
      valor_a_pagar,
      valor_parcial,
      fecha_vencimiento,
    } = req.body;

    let cliente = await Cliente.findOne({
      where: { identificacion: cliente_id }
    });

    if (!cliente && forma_cargue === 'manual') {
      cliente = await Cliente.create({
        identificacion: cliente_id,
        tipo_identificacion: tipo_identificacion,
        nombre_cliente: nombre_cliente,
      });
    }

    if (!cliente) {
      return res.status(400).json({ message: 'Cliente no encontrado' });
    }

    if (forma_cargue === 'archivo' && orden_cargue_archivo) {
      const ordenCargue = await OrdenCargue.findByPk(orden_cargue_archivo);
      if (!ordenCargue) {
        return res.status(400).json({ message: 'Orden de cargue no encontrada' });
      }
    }

    // Usuario creador si es manual
    let usuario_crea_manual = null;
    if (forma_cargue === 'manual') {
      usuario_crea_manual = req.user.id;
    }

    // Crear la orden de pago
    const ordenPago = await OrdenPago.create({
      cliente_id: cliente.id,
      fecha_creacion: fecha_creacion || new Date(),
      ultimo_intento_pago,
      forma_cargue,
      usuario_crea_manual,
      orden_cargue_archivo: forma_cargue === 'archivo' ? orden_cargue_archivo : null,
      valor_a_pagar,
      valor_parcial,
      fecha_vencimiento,
      estado: "CARGADO"
    });

    res.status(201).json(ordenPago);
  } catch (error) {
    console.log("error: ", error);
    next(error);
  }
};

/**
 * Update orden de pago
 * @route PUT /ordenes-pago/:id
 */
const updateOrdenPago = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      cliente_id,
      ultimo_intento_pago,
      valor_a_pagar,
      valor_parcial,
      fecha_vencimiento
    } = req.body;

    let newClienteId;

    const ordenPago = await OrdenPago.findByPk(id);
    if (!ordenPago) {
      return res.status(404).json({ message: 'Orden de pago not found' });
    }

    // Check if cliente exists if cliente_id is provided
    // Verificar si el cliente existe usando cliente_id como identificación
    if (cliente_id) {
      const cliente = await Cliente.findOne({ where: { identificacion: cliente_id } });

      newClienteId = cliente.id;
      if (!cliente) {
        return res.status(400).json({ message: 'Cliente not found' });
      }
    }

    // Update ordenPago
    await ordenPago.update({
      cliente_id: newClienteId,
      ultimo_intento_pago: ultimo_intento_pago || ordenPago.ultimo_intento_pago,
      valor_a_pagar: valor_a_pagar || ordenPago.valor_a_pagar,
      valor_parcial: valor_parcial,
      fecha_vencimiento: fecha_vencimiento
    });

    res.json(ordenPago);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete orden de pago
 * @route DELETE /ordenes-pago/:id
 */
const deleteOrdenPago = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ordenPago = await OrdenPago.findByPk(id);
    if (!ordenPago) {
      return res.status(404).json({ message: 'Orden de pago not found' });
    }

    await ordenPago.destroy();

    res.json({ message: 'Orden de pago deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getOrdenesPagoByCliente = async (req, res, next) => {
  const { tipo_identificacion, identificacion, proceso } = req.body;

  try {
    const cliente = await Cliente.findOne({ where: { tipo_identificacion, identificacion } });

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    let ordenes;

    if (proceso === 'PENDIENTES') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      ordenes = await OrdenPago.findAll({
        where: { cliente_id: cliente.id },
        include: [
          {
            model: Transaccion,
            as: 'transacciones',
            include: [
              {
                model: EstadoTransaccion,
                as: 'estados',
                order: [['fecha_hora_estado', 'DESC']]
              }
            ]
          }
        ]
      });

      ordenes = ordenes.filter((orden) => {
        const fecha = new Date(orden.fecha_vencimiento);
        const venceDespuesDeHoy = fecha >= today;
        if (!venceDespuesDeHoy) return false;

        const transacciones = orden.transacciones || [];

        if (transacciones.length === 0) return true;

        const ultimaTransaccion = transacciones[transacciones.length - 1];
        const estadosOrdenados = (ultimaTransaccion.estados || []).sort(
          (a, b) => new Date(b.fecha_hora_estado) - new Date(a.fecha_hora_estado)
        );
        const ultimoEstado = estadosOrdenados[0]?.nombre_estado;

        return !['APROBADA','APROBADO', 'EN PROCESO'].includes(ultimoEstado);
      });
    } else {
      ordenes = await OrdenPago.findAll({
        where: { cliente_id: cliente.id }
      });
    }

    return res.json(ordenes);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllOrdenesPago,
  getOrdenPagoById,
  createOrdenPago,
  updateOrdenPago,
  deleteOrdenPago,
  getOrdenesPagoByCliente
};