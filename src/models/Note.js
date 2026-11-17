import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 10000 },
  },
  { timestamps: true, versionKey: false }
);

// "My notes, newest first": equality on owner then sort on _id, no in-memory sort.
noteSchema.index({ owner: 1, _id: -1 });

export default mongoose.model('Note', noteSchema);
