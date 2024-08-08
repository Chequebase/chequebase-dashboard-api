// import { cdb } from '@/modules/common/mongoose';
// import { ObjectId } from 'mongodb';
// import mongoose, { Schema } from 'mongoose';
// import aggregatePaginate from 'mongoose-aggregate-paginate-v2';
// import mongoosePaginate from 'mongoose-paginate-v2';

// export interface ISession {
//   _id: ObjectId;
//   user: ObjectId;
//   token: string;
//   ip: string;
//   userAgent: string;
//   expiresAt: Date;
//   createdAt: Date;
//   updatedAt: Date;
// }

// interface SessionModel extends
//   mongoose.PaginateModel<ISession>,
//   mongoose.AggregatePaginateModel<ISession> { }

// const sessionSchema = new Schema<ISession>({
//   user: {
//     type: Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//   },
//   token: {
//     type: String,
//     required: true,
//     unique: true,
//   },
//   ip: {
//     type: String,
//     required: true,
//   },
//   userAgent: {
//     type: String,
//     required: true,
//   },
//   expiresAt: {
//     type: Date,
//     required: true,
//   },
// }, { timestamps: true });

// sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index to automatically remove expired sessions
// sessionSchema.plugin(aggregatePaginate);
// sessionSchema.plugin(mongoosePaginate);

// const Session = cdb.model<ISession, SessionModel>('Session', sessionSchema);

// export default Session;
