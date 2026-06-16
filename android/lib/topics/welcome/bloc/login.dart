import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';

class LoginState {
  int selectedGym;
  String username;
  String password;
  LoginState(this.selectedGym, this.username, this.password);
}

class LoginBloc extends Cubit<LoginState> {
  Function()? onGymSubmitted;
  LoginBloc() : super(LoginState(0, "", ""));

  Future<void> login(BuildContext context) async {
    context.read<StudentBloc>().add(StudentLoggedIn(
        Account(state.selectedGym, state.username, state.password), true));
  }

  void setUsername(String username) {
    emit(state..username = username);
  }

  void setPassword(String password) {
    emit(state..password = password);
  }

  void setGymSubmittedCallback(Function() onGymSubmitted) {
    this.onGymSubmitted = onGymSubmitted;
  }

  void setGym(int selected) {
    emit(state..selectedGym = selected);
    if (onGymSubmitted != null) {
      onGymSubmitted!();
    }
  }
}
