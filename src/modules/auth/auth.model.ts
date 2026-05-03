import mongoose, { Schema, Document } from 'mongoose'
import bcrypt from 'bcryptjs'
import { Role, ROLES } from '../../config/permissions'

export interface IUser extends Document {
  name:            string
  email:           string
  password:        string
  role:            Role
  phone:           string
  isAvailable:     boolean
  activeTaskCount: number
  lastAssignedAt:  Date
  devices:         Array<{ deviceId: string; userAgent: string; ip: string; lastSeen: Date }>
  isActive:        boolean
  passwordResetTokenHash?:    string
  passwordResetExpiresAt?:    Date
  comparePassword(candidate: string): Promise<boolean>
}

const userSchema = new Schema<IUser>(
  {
    name:            { type: String, required: true, trim: true },
    email:           { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:        { type: String, required: true, minlength: 8, select: false },
    role:            { type: String, enum: ROLES, required: true },
    phone:           { type: String, default: '' },
    isAvailable:     { type: Boolean, default: true },
    activeTaskCount: { type: Number, default: 0 },
    lastAssignedAt:  { type: Date },
    devices: [{
      deviceId:  String,
      userAgent: String,
      ip:        String,
      lastSeen:  Date,
    }],
    isActive:                { type: Boolean, default: true },
    passwordResetTokenHash:  { type: String, select: false },
    passwordResetExpiresAt:  { type: Date,   select: false },
  },
  { timestamps: true }
)

userSchema.index({ role: 1 })
userSchema.index({ isAvailable: 1, activeTaskCount: 1 })

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 12)
})

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password)
}

export const User = mongoose.model<IUser>('User', userSchema)
