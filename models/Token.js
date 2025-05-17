import mongoose, { mongo, Schema } from 'mongoose'

const tokenSchema =  new mongoose.Schema({
    userId : {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        unique: true
    },
    token: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now(),
        expires: 3600
    }
})

export const tokenModel = mongoose.model('Token', tokenSchema)