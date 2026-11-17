import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 10000 },
  },
  { timestamps: true, versionKey: false }
);

// $lookup foreignField + sort inside the sub-pipeline.
postSchema.index({ author: 1, _id: -1 });

export default mongoose.model('Post', postSchema);
