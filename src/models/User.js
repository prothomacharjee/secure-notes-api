import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    interests: [{ type: String, trim: true, lowercase: true, maxlength: 50 }],
  },
  { timestamps: true }
);

// Login lookup + uniqueness.
userSchema.index({ email: 1 }, { unique: true });
// Multikey; serves the ?interest= filter in the group-by-interests pipeline.
userSchema.index({ interests: 1 });

userSchema.pre('save', async function () {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
