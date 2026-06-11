import Seller from '../../../models/Seller.js';
import { multerFileToUploadPath } from '../../../utils/uploadPaths.js';

export const getAllSellers = async (req, res) => {
    try {
        const { status, search } = req.query;
        const query = {};
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { business_name: { $regex: search, $options: 'i' } },
                { fullname: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        const sellers = await Seller.find(query).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: sellers });
    } catch (error) {
        console.error('Get All Sellers Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

export const approveSeller = async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

        const seller = await Seller.findByIdAndUpdate(
            id,
            { status: 'Active', is_approved: true },
            { new: true }
        );
        if (!seller) return res.status(404).json({ success: false, message: 'Seller not found.' });

        res.status(200).json({ success: true, message: 'Seller approved successfully.', status: seller.status });
    } catch (error) {
        console.error('Approve Seller Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

export const rejectSeller = async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

        const seller = await Seller.findByIdAndUpdate(
            id,
            { status: 'Blocked', is_approved: false },
            { new: true }
        );
        if (!seller) return res.status(404).json({ success: false, message: 'Seller not found.' });

        res.status(200).json({ success: true, message: 'Seller rejected successfully.', status: seller.status });
    } catch (error) {
        console.error('Reject Seller Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

export const revertSeller = async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

        // Find seller first
        const seller = await Seller.findById(id);
        if (!seller) {
            return res.status(404).json({ success: false, message: 'Seller not found.' });
        }

        // Check if already pending (lowercase to match enum)
        if (seller.status === 'Inactive') {
            return res.status(400).json({
                success: false,
                message: 'Seller status is already Inactive.'
            });
        }

        // Update status to pending
        seller.status = 'Inactive';
        seller.is_approved = false;
        await seller.save();

        res.status(200).json({
            success: true,
            message: 'Seller status reverted to Inactive successfully.',
            status: seller.status
        });
    } catch (error) {
        console.error('Revert Seller Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

export const editSeller = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

        const seller = await Seller.findById(id);
        if (!seller) {
            return res.status(404).json({ success: false, message: 'Seller not found.' });
        }

        const { 
            business_name, 
            fullname, 
            email, 
            phone_number, 
            address, 
            gst_number,
            adhar_number,
            bank_account_no,
            ifsc_code,
            bank_holder_name,
            is_verified, 
            is_approved, 
            status 
        } = req.body;

        // Update personal and business information
        if (business_name !== undefined) seller.business_name = business_name;
        if (fullname !== undefined) seller.fullname = fullname;
        if (email !== undefined) seller.email = email;
        if (phone_number !== undefined) seller.phone_number = phone_number;
        if (address !== undefined) seller.address = address;
        if (gst_number !== undefined) seller.gst_number = gst_number;
        if (adhar_number !== undefined) seller.adhar_number = adhar_number;
        if (bank_account_no !== undefined) seller.bank_account_no = bank_account_no;
        if (ifsc_code !== undefined) seller.ifsc_code = ifsc_code;
        if (bank_holder_name !== undefined) seller.bank_holder_name = bank_holder_name;
        if (is_verified !== undefined) seller.is_verified = is_verified;
        if (is_approved !== undefined) seller.is_approved = is_approved;
        if (status !== undefined) seller.status = status;

        // Handle file uploads for documents
        if (req.files) {
            if (req.files['profile_image']) {
                seller.profile_image = multerFileToUploadPath(req.files['profile_image'][0]);
            }
            if (req.files['adhar_document']) {
                seller.adhar_document = multerFileToUploadPath(req.files['adhar_document'][0]);
            }
            if (req.files['pan_document']) {
                seller.pan_document = multerFileToUploadPath(req.files['pan_document'][0]);
            }
        }

        const updatedSeller = await seller.save();

        res.status(200).json({
            success: true,
            message: 'Seller updated successfully.',
            seller: updatedSeller
        });
    } catch (error) {
        console.error('Edit Seller Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

export const deleteSeller = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

        const seller = await Seller.findByIdAndDelete(id);
        if (!seller) {
            return res.status(404).json({ success: false, message: 'Seller not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Seller deleted successfully.',
            seller
        });
    } catch (error) {
        console.error('Delete Seller Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const sellerController = {
    getAllSellers,
    approveSeller,
    rejectSeller,
    revertSeller,
    editSeller,
    deleteSeller,
};

export default sellerController;
