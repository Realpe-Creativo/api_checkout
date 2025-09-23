// graphql/typeDefs.js
const { gql } = require('apollo-server-express');

const typeDefs = gql`
  ################################################
  #                  TIPOS                       #
  ################################################

  type User {
    id: ID!
    email: String!
    nombre: String!
  }

  type Debt {
    id: ID!
    amount: Float!
    date: String!
    concept: String!
    paymentUrl: String!
  }

  type OrdenPago {
    order_id: ID!
    cliente_id: String!
    forma_cargue: String
    valor_a_pagar: Float!
    valor_parcial: Float!
    fecha_creacion: String
    fecha_vencimiento: String
    estado: String

    cliente: Cliente!
    ultimo_intento_pago: Transaccion
    usuario_cargue: User
  }

  type Cliente {
    id: ID!
    nombre_cliente: String!
    tipo_identificacion: String
    identificacion: String

    ordenesPago: [OrdenPago!]!
  }

  type EstadoTransaccion {
    id_estado: String!
    id_transaccion: String!
    nombre_estado: String
    fecha_hora_estado: String
  }

  type Transaccion {
    id_transaccion: String!
    referencia: String!
    valor_de_pago: String
    id_orden_pago: String!
    ultimo_estado: String

    ordenPago: OrdenPago
    estadoActual: EstadoTransaccion
    estados: [EstadoTransaccion!]!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  ################################################
  #                  QUERIES                     #
  ################################################

  type Query {
    # Devuelve el usuario autenticado a partir del token
    me: User

    # Lista todas las deudas
    debts: [Debt!]!

    # Obtiene una deuda por su ID
    debt(id: ID!): Debt

    # Obtiene todas las ordenes de pago
    ordenesPago: [OrdenPago!]!

    # Lista todos los clientes
    clientes: [Cliente!]!

    # Obtiene un cliente por su ID
    cliente(id: ID!): Cliente

    # Lista todas las transacciones con detalle completo
    transacciones(fecha: String): [Transaccion!]!
  }

  ################################################
  #                 MUTATIONS                    #
  ################################################

  type Mutation {
    # Autentica con email + password, retorna un JWT + datos básicos
    login(email: String!, password: String!): AuthPayload!

    # Crea una nueva deuda (puedes exigir auth si lo deseas)
    createDebt(
      amount: Float!
      date: String!
      concept: String!
      paymentUrl: String!
    ): Debt!
  }
`;

module.exports = typeDefs;
